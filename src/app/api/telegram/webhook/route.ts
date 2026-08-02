// SIR V2 — Webhook de Telegram (canal conversacional, MVP Q&A).
//
// POST → updates del bot. En el MVP: le PREGUNTAS a SIR por Telegram y responde
// cruzando tu data (mismo cerebro askSir() que la web). Solo TU chat (allowlist).
// La memoria semántica ya es compartida con la web (askSir persiste en
// sir_conversations por user_id → recall C3 cross-canal). El hilo lineal 100%
// unificado (tabla sir_messages) es el paso siguiente.
//
// SEGURIDAD: secret token del webhook (header X-Telegram-Bot-Api-Secret-Token,
// registrado vía setWebhook) + allowlist de chat_id. Un desconocido NO habla con
// tu SIR. INERTE sin config: sin TELEGRAM_BOT_TOKEN/SECRET responde 200 sin nada.
//
// Env (secrets del server): TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
// TELEGRAM_ALLOWED_CHAT_ID, TELEGRAM_OWNER_USER_ID, ANTHROPIC_API_KEY,
// SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL.

import { NextResponse, type NextRequest, after } from 'next/server'
import { guardarFotoTelegram } from '@/lib/capture/guardarFotoTelegram'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'

import { parseTelegramUpdate, parseTelegramCallback } from '@/lib/telegram/inbound'
import {
  isTelegramConfigured, verifyTelegramSecret, sendTelegramMessage, downloadTelegramFile,
  answerCallbackQuery, editTelegramMessageText, sendTelegramKeyboard, editTelegramKeyboard,
} from '@/lib/telegram/client'
import { feedbackButtons, parseFeedbackCallback, handleFeedbackTap } from '@/lib/telegram/feedback'
import { pendingDailyHabits, habitCallbackData, parseHabitCallback } from '@/lib/habits/checkinButtons'
import { limaDayString } from '@/lib/habits/streak'
import { toPlainText } from '@/lib/telegram/format'
import { transcribeAudio } from '@/lib/ai/transcribeAudio'
import { askSir, AskSirConfigError } from '@/lib/sir/askSir'
import { getSirThread, appendSirThread } from '@/lib/sir/thread'
import { executeProposedAction, isExecutableByChat } from '@/lib/sir/executeAction'
import { savePendingAction, loadPendingAction, deletePendingAction } from '@/lib/sir/pendingActions'
import { summarizeActionForConfirm } from '@/lib/sir/actionSummary'
import { trackServer } from '@/lib/analytics/serverTrack'
import { extractStoryVision } from '@/lib/social-reader/storyVision'
import { deriveSocialSignal } from '@/lib/social-reader/derive'
import { buildPersonIndex, matchPerson, type PersonLite } from '@/lib/social-reader/match'
import { parseWhoIsWhoReply, buildWhoIsWhoKeyboard } from '@/lib/social-reader/whoIsWho'
import { parseIdentityCallback, handleFromCaption, orgNameFromHandle } from '@/lib/social-reader/askIdentity'
import { orgSlug, inferParentOrg } from '@/lib/social-reader/entityKind'
import { parseBriefCallback } from '@/lib/telegram/briefThread'
import { orgBatchApply, runBriefAction } from '@/lib/telegram/briefActions'
import { parseExclusiones, parseOrgBatch } from '@/lib/social-reader/orgBatch'
import { relacionesUrl } from '@/lib/app-url'
import type { LlmImageMediaType } from '@/lib/llm/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const IMG_TYPES: ReadonlySet<string> = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
function normalizeImageMediaType(mime: string): LlmImageMediaType {
  return (IMG_TYPES.has(mime) ? mime : 'image/jpeg') as LlmImageMediaType
}

/**
 * Screenshot social (story de IG / perfil) → señal de TIMING. El camino
 * mobile-native: Aaron ve la story en el celular y le manda la captura a SIR.
 * Visión saca de quién es (handle/nombre) y qué dice; se deriva la señal y se
 * inserta en contact_activity. Responde en Telegram con lo que anotó. No lanza.
 */
async function handleSocialPhoto(
  supabase: SupabaseClient, ownerId: string, chatId: number, photoFileId: string, caption: string,
): Promise<void> {
  const media = await downloadTelegramFile(photoFileId)
  if (!media) { await sendTelegramMessage(chatId, 'No pude bajar la imagen 😕. Reintenta.'); return }
  const base64 = Buffer.from(media.bytes).toString('base64')
  let vis
  try { vis = await extractStoryVision({ supabase, userId: ownerId }, base64, normalizeImageMediaType(media.mimeType)) } catch { vis = null }
  if (!vis || !vis.isSocial) {
    // NO ES UNA STORY → NO SE TIRA. Hasta el 2-ago-2026 acá se respondía "no
    // parece una story/perfil…" y se hacía `return`: la imagen se descartaba sin
    // guardarse, sin observación y sin rastro ni en `sir_messages`. Aaron:
    // *"hay cosas que le envié a SIR por Telegram y no pudo identificar"*.
    // Un documento, un examen, la báscula o una tarjeta de contacto se perdían.
    //
    // Ahora se clasifica y se guarda igual; si no se entiende, queda como
    // `unknown` con el texto que se le haya podido sacar. No saber qué es NO
    // puede seguir significando tirarlo. Ver `lib/capture/guardarFotoTelegram`.
    const g = await guardarFotoTelegram(
      { supabase, userId: ownerId }, media.bytes, normalizeImageMediaType(media.mimeType), caption, new Date(),
    )
    await sendTelegramMessage(chatId, g.respuesta)
    return
  }

  const text = [vis.text, caption].filter((s) => s && s.trim()).join(' · ') || null
  const signal = deriveSocialSignal({ platform: vis.platform, text, hasActiveStory: vis.platform === 'instagram' })

  const { data: peopleRows } = await supabase
    .from('people').select('id, name, instagram_handle, linkedin_url, title').eq('user_id', ownerId).limit(2000)
  const people: PersonLite[] = (peopleRows ?? []).map((r) => ({
    id: String(r.id), name: String(r.name ?? ''),
    instagramHandle: (r.instagram_handle as string | null) ?? null,
    linkedinUrl: (r.linkedin_url as string | null) ?? null,
    title: (r.title as string | null) ?? null,
  }))
  const m = matchPerson(buildPersonIndex(people), { platform: vis.platform, handle: vis.handle ?? undefined, name: vis.name ?? undefined })

  if (!m) {
    const who = vis.handle ? `@${vis.handle}` : (vis.name || 'esa cuenta')
    await sendTelegramMessage(chatId, `Es de ${who}, pero no la tengo con ese ${vis.handle ? 'handle' : 'nombre'}. Setéale el ${vis.handle ? 'instagram_handle' : 'nombre/LinkedIn'} en su ficha y la próxima la anoto sola.`)
    return
  }
  if (!signal) {
    await sendTelegramMessage(chatId, `Vi la story de ${m.person.name}, pero no saqué una señal de timing clara. Si quieres, marca "de viaje"/"a full" en su ficha.`)
    return
  }

  const sinceIso = new Date(Date.now() - 6 * 3_600_000).toISOString()
  const { data: recent } = await supabase
    .from('contact_activity').select('id')
    .eq('user_id', ownerId).eq('person_id', m.person.id).eq('kind', signal.kind).gte('observed_at', sinceIso).limit(1)
  if (!recent || recent.length === 0) {
    await supabase.from('contact_activity').insert({
      user_id: ownerId, person_id: m.person.id, kind: signal.kind, detail: signal.detail, source: vis.platform,
    })
  }
  const verbo = signal.kind === 'traveling' ? 'está de viaje'
    : signal.kind === 'available' ? 'está por acá/activa'
    : signal.kind === 'job_change' ? 'cambió de trabajo'
    : 'tiene una novedad'
  await sendTelegramMessage(chatId, `📸 Anotado: ${m.person.name} ${verbo}${signal.detail ? ` — "${signal.detail}"` : ''}. Te aviso antes de contactarla si es mal momento.`)
  await trackServer('social_story_captured', { platform: vis.platform, kind: signal.kind }, ownerId)
}

/** Hábitos diarios activos + los que faltan marcar hoy. Reusa la lógica pura. */
async function loadPendingHabits(supabase: SupabaseClient, userId: string, now: Date) {
  const { data: habitRows } = await supabase
    .from('habits').select('id, title, cadence').eq('user_id', userId).eq('active', true).limit(50)
  const habitList = (habitRows ?? []) as Array<{ id: string; title: string; cadence: string }>
  if (habitList.length === 0) return []
  const since = new Date(now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10)
  const { data: ckRows } = await supabase
    .from('habit_checkins').select('habit_id, date').eq('user_id', userId).gte('date', since).limit(2000)
  const byHabit = new Map<string, string[]>()
  for (const c of (ckRows ?? []) as Array<{ habit_id: string; date: string }>) {
    const arr = byHabit.get(c.habit_id) ?? []; arr.push(c.date); byHabit.set(c.habit_id, arr)
  }
  return pendingDailyHabits(
    habitList.map((h) => ({ id: h.id, title: h.title, cadence: h.cadence, checkinDates: byHabit.get(h.id) ?? [] })),
    limaDayString(now),
  )
}

/** Envía el check-in de hábitos por botones (un botón por hábito pendiente hoy).
 *  Reusado por el tap y por el comando on-demand. Devuelve cuántos mandó. */
async function sendHabitCheckin(supabase: SupabaseClient, userId: string, chatId: number, now: Date): Promise<number> {
  const pending = await loadPendingHabits(supabase, userId, now)
  if (pending.length === 0) return 0
  const rows = pending.slice(0, 8).map((h) => [{ text: `✅ ${h.title}`, callbackData: habitCallbackData(h.id) }])
  await sendTelegramKeyboard(chatId, '¿Cuáles de tus hábitos hiciste hoy? Toca los que sí 👇', rows)
  return pending.length
}

/** Tap de un hábito: lo marca hecho hoy (idempotente) y actualiza el mensaje con
 *  los que quedan (o cierra si ya no queda ninguno). */
async function handleHabitTap(
  supabase: SupabaseClient, userId: string, chatId: number, messageId: number, callbackId: string, habitId: string,
): Promise<void> {
  const now = new Date()
  const today = limaDayString(now)
  const { data: habit } = await supabase.from('habits').select('id, title').eq('user_id', userId).eq('id', habitId).maybeSingle()
  const title = (habit as { title?: string } | null)?.title ?? 'hábito'
  // Idempotente: si ya está marcado hoy, no duplicamos.
  const { data: exists } = await supabase
    .from('habit_checkins').select('id').eq('user_id', userId).eq('habit_id', habitId).eq('date', today).maybeSingle()
  if (!exists) {
    await supabase.from('habit_checkins').insert({ user_id: userId, habit_id: habitId, date: today })
    await trackServer('habit_checked', { channel: 'telegram', via: 'button' }, userId)
  }
  await answerCallbackQuery(callbackId, `✓ ${title}`)
  // Rearmar el mensaje con los que faltan.
  const pending = await loadPendingHabits(supabase, userId, now)
  if (pending.length === 0) {
    await editTelegramKeyboard(chatId, messageId, `✅ Listo — marqué todos tus hábitos de hoy. Bien ahí, Aaron 🙌`, [])
  } else {
    const rows = pending.slice(0, 8).map((h) => [{ text: `✅ ${h.title}`, callbackData: habitCallbackData(h.id) }])
    await editTelegramKeyboard(chatId, messageId, `✓ ${title} marcado. ¿Cuáles más hiciste hoy? 👇`, rows)
  }
}

/** Tap "✕ No es contacto" del ¿quién es quién?: descarta la cuenta (reversible)
 *  y rearma el mensaje con las que quedan de la tanda. */
async function handleWhoIsWhoDismiss(
  supabase: SupabaseClient, userId: string, chatId: number, messageId: number, callbackId: string, unmatchedId: string,
): Promise<void> {
  await supabase.from('unmatched_social_activity').delete().eq('user_id', userId).eq('id', unmatchedId)
  await answerCallbackQuery(callbackId, 'Descartado ✕')
  // Las que quedan de esta tanda (preguntadas hace poco, aún presentes).
  const since = new Date(Date.now() - 26 * 3_600_000).toISOString()
  const { data } = await supabase
    .from('unmatched_social_activity')
    .select('id, handle, name')
    .eq('user_id', userId).eq('platform', 'instagram').eq('kind', 'available')
    .not('handle', 'is', null).gte('asked_at', since)
    .order('observed_at', { ascending: false }).limit(10)
  const rows = ((data ?? []) as Array<{ id: string; handle: string; name: string | null }>)
  if (rows.length === 0) {
    await editTelegramKeyboard(chatId, messageId, '✓ Listo. Para nombrar a las que sí son tu gente, ábrelas en la app (ahí ves su cara).', [])
    return
  }
  const { text, keyboard } = buildWhoIsWhoKeyboard(rows, relacionesUrl())
  await editTelegramKeyboard(chatId, messageId, text, keyboard)
}

/**
 * Responde los 3 botones de la tarjeta de identidad (foto + persona/empresa/no).
 *
 * Nació del pedido de Aaron del 28-jul ("ya me aburrí del excel, que SIR me
 * pregunte pasivamente si es tal persona o si es una empresa"). Cada rama cierra
 * el loop sola:
 *   · persona → le pide el nombre; él responde AL MENSAJE y `resolveWhoIsWho`
 *               (que ya existía) crea la ficha y promueve la actividad.
 *   · empresa → crea la organización YA, con un nombre derivado del handle y
 *               ofreciendo corregirlo. No la deja pendiente ni la borra: una página
 *               es data del grafo (quién de su gente la sigue), no basura.
 *   · no      → la descarta.
 */
async function handleIdentityAnswer(
  supabase: SupabaseClient, userId: string, chatId: number, callbackId: string,
  action: 'person' | 'org' | 'dismiss', unmatchedId: string,
): Promise<void> {
  const { data } = await supabase
    .from('unmatched_social_activity')
    .select('id, handle, detail')
    .eq('user_id', userId).eq('id', unmatchedId).maybeSingle()
  const row = data as { id: string; handle: string | null; detail: string | null } | null
  if (!row?.handle) { await answerCallbackQuery(callbackId, 'Ya no la tengo pendiente.'); return }
  const handle = row.handle

  if (action === 'dismiss') {
    await supabase.from('unmatched_social_activity').delete().eq('user_id', userId).eq('handle', handle)
    await answerCallbackQuery(callbackId, 'Descartada ✕')
    return
  }

  if (action === 'person') {
    // No se crea nada todavía: sin nombre, crear la ficha sería inventarla. Se le
    // pide, y su respuesta cae en `resolveWhoIsWho`, que ya sabe asignar o crear.
    await answerCallbackQuery(callbackId, 'Dale, ¿cómo se llama?')
    await sendTelegramMessage(
      chatId,
      `Perfecto, @${handle} es una persona. Respóndeme a este mensaje con su nombre completo y le creo la ficha (o la enlazo si ya la tengo).`,
    )
    return
  }

  // ORGANIZACIÓN.
  const nombre = orgNameFromHandle(handle)
  const slug = orgSlug(nombre)
  const { data: existentes } = await supabase.from('org_profiles').select('org_slug').eq('user_id', userId).limit(500)
  const slugs = ((existentes ?? []) as Array<{ org_slug: string }>).map((o) => o.org_slug)
  const padre = inferParentOrg(nombre, slugs)

  const { error } = await supabase.from('org_profiles').upsert({
    id: `org_${slug}`.slice(0, 60), user_id: userId,
    org_slug: slug, name: nombre, instagram_handle: handle,
    parent_org: padre,
    notes: row.detail ?? null,
    source: 'Telegram — ¿persona o empresa?',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  // PostgREST no lanza: el error viene en `.error` (trampa de #947).
  if (error) { await answerCallbackQuery(callbackId, 'No pude crearla, reintenta.'); return }

  await supabase.from('unmatched_social_activity').delete().eq('user_id', userId).eq('handle', handle)
  await answerCallbackQuery(callbackId, `Creada: ${nombre}`)
  await sendTelegramMessage(
    chatId,
    `🏢 Anoté @${handle} como organización: "${nombre}"${padre ? ` (colgada de ${padre.toUpperCase()})` : ''}.\n\n`
    + 'Si el nombre no es ese, respóndeme a este mensaje con el correcto. Y cuando el reader vea quién de tu gente la sigue, te digo qué contactos tienes ahí.',
  )
}

/** user_id dueño de la data: env explícito o único profile (patrón reader). */
async function resolveOwnerId(admin: SupabaseClient): Promise<string | null> {
  const explicit = process.env.TELEGRAM_OWNER_USER_ID?.trim()
  if (explicit) return explicit
  try {
    const { data } = await admin.from('profiles').select('id').limit(2)
    const rows = (data ?? []) as Array<{ id: string }>
    return rows.length === 1 ? rows[0].id : null
  } catch { return null }
}

/**
 * "¿Quién es quién?" — procesa una respuesta de Aaron a la pregunta del reader.
 * Detección conservadora: solo actúa si el texto trae @handles que EXISTEN como
 * pendientes en unmatched_social_activity (si no, no era una respuesta whois →
 * sigue como chat normal). Por cada handle: nombre → matchea a una persona, le
 * setea el instagram_handle, promueve las señales guardadas a contact_activity y
 * lo saca de la bandeja; "no" → descarta. Devuelve un resumen para responder.
 */
async function resolveWhoIsWho(
  supabase: SupabaseClient, ownerId: string, text: string,
): Promise<{ handled: boolean; reply: string }> {
  const parsed = parseWhoIsWhoReply(text)
  if (parsed.length === 0) return { handled: false, reply: '' }
  const handles = parsed.map((p) => p.handle)
  const { data: pend } = await supabase
    .from('unmatched_social_activity')
    .select('id, handle, kind, detail, observed_at')
    .eq('user_id', ownerId).in('handle', handles)
  const pending = (pend ?? []) as Array<{ id: string; handle: string; kind: string; detail: string | null; observed_at: string }>
  if (pending.length === 0) return { handled: false, reply: '' } // no era whois → chat normal

  const { data: peopleRows } = await supabase
    .from('people').select('id, name, instagram_handle, linkedin_url, title').eq('user_id', ownerId).limit(2000)
  const people: PersonLite[] = (peopleRows ?? []).map((r) => ({
    id: String(r.id), name: String(r.name ?? ''),
    instagramHandle: (r.instagram_handle as string | null) ?? null,
    linkedinUrl: (r.linkedin_url as string | null) ?? null,
    title: (r.title as string | null) ?? null,
  }))
  const index = buildPersonIndex(people)
  const byHandle = new Map<string, typeof pending>()
  for (const p of pending) { const a = byHandle.get(p.handle) ?? []; a.push(p); byHandle.set(p.handle, a) }

  const assigned: string[] = []; const created: string[] = []; const dismissed: string[] = []; const failed: string[] = []
  const sinceIso = new Date(Date.now() - 6 * 3_600_000).toISOString()
  for (const { handle, name } of parsed) {
    const rows = byHandle.get(handle)
    if (!rows || rows.length === 0) continue
    if (name === null) {
      await supabase.from('unmatched_social_activity').delete().eq('user_id', ownerId).eq('handle', handle)
      dismissed.push(`@${handle}`)
      continue
    }
    // Matchear un contacto existente por nombre, o CREARLO si no está (Aaron:
    // "los que no hay hay que crearlos"). En ambos casos queda con el handle.
    const m = matchPerson(index, { platform: 'instagram', name })
    let personId: string
    let personName: string
    if (m) {
      personId = m.person.id
      personName = m.person.name
      await supabase.from('people').update({ instagram_handle: handle }).eq('id', personId)
      assigned.push(`@${handle} → ${personName}`)
    } else {
      const pid = crypto.randomUUID()
      const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null
      const { error: insErr } = await supabase.from('people').insert({
        id: pid, user_id: ownerId, name: name.slice(0, 120), slug,
        relationship: 'acquaintance', category: 'network',
        importance_score: 5, energy_impact: 'neutral', trust_level: 5,
        instagram_handle: handle, notes: 'Creado desde ¿quién es quién? (Telegram)',
      })
      if (insErr) { failed.push(`${name} (@${handle})`); continue }
      personId = pid
      personName = name.slice(0, 120)
      created.push(`@${handle} → ${personName}`)
    }
    // Promover las señales guardadas de ese handle a contact_activity (dedup 6h).
    for (const r of rows) {
      const { data: rec } = await supabase.from('contact_activity').select('id')
        .eq('user_id', ownerId).eq('person_id', personId).eq('kind', r.kind).gte('observed_at', sinceIso).limit(1)
      if (!rec || rec.length === 0) {
        await supabase.from('contact_activity').insert({ user_id: ownerId, person_id: personId, kind: r.kind, detail: r.detail, source: 'instagram', observed_at: r.observed_at })
      }
    }
    await supabase.from('unmatched_social_activity').delete().eq('user_id', ownerId).eq('handle', handle)
  }

  const parts: string[] = []
  if (assigned.length) parts.push(`✅ Enlazados:\n${assigned.map((a) => `· ${a}`).join('\n')}`)
  if (created.length) parts.push(`🆕 Creados y enlazados:\n${created.map((a) => `· ${a}`).join('\n')}`)
  if (dismissed.length) parts.push(`🗑️ Descartados: ${dismissed.join(', ')}`)
  if (failed.length) parts.push(`⚠️ No pude guardar: ${failed.join(', ')}. Reinténtalo en un momento.`)
  const reply = parts.length ? `${parts.join('\n\n')}\n\nDe ahora en más los reconozco solos en Instagram.` : 'Anotado.'
  return { handled: true, reply }
}

export async function POST(req: NextRequest) {
  // Sin config → inerte (200 para que Telegram no reintente durante el setup).
  if (!isTelegramConfigured()) return NextResponse.json({ ok: true, inert: true })

  // Verificación: el header debe coincidir con el secret de setWebhook.
  if (!verifyTelegramSecret(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return new NextResponse('invalid secret', { status: 401 })
  }

  let payload: unknown
  try { payload = await req.json() } catch { return NextResponse.json({ ok: true }) }

  const allowedChat = process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim()
  const svcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // ── Tap de botón inline: confirmación de captura de notas ───────────
  // callback_data: "sv|<pendingId>|1" (guardar) | "sv|<pendingId>|0" (descartar).
  const cb = parseTelegramCallback(payload)
  if (cb) {
    after(async () => {
      if (!allowedChat || String(cb.chatId) !== allowedChat || !svcUrl || !svcKey) {
        await answerCallbackQuery(cb.callbackId)
        return
      }
      const supabase = createServiceClient(svcUrl, svcKey, { auth: { persistSession: false } })
      const ownerId = await resolveOwnerId(supabase)
      if (!ownerId) { await answerCallbackQuery(cb.callbackId); return }

      // 👍/👎 sobre una respuesta de SIR: "fb|<u|d>|<isoDelTurno>". Va primero
      // porque es el tap más frecuente que puede llegar y no depende de nada más.
      const fb = parseFeedbackCallback(cb.data)
      if (fb) {
        await handleFeedbackTap(supabase, ownerId, cb.callbackId, fb)
        return
      }

      // Tap de un hábito (check-in por botones): "hb|<habitId>" → marcar hecho hoy.
      const habitId = parseHabitCallback(cb.data)
      if (habitId) {
        await handleHabitTap(supabase, ownerId, cb.chatId, cb.messageId, cb.callbackId, habitId)
        return
      }

      // TARJETA DE IDENTIDAD (foto + 3 botones): "wi|<p|o|x>|<unmatchedId>".
      // Aaron pidió que SIR pregunte pasivamente "¿es persona o es empresa?" en vez
      // de llenar un Excel. Las tres salidas son de un toque.
      const ident = parseIdentityCallback(cb.data)
      if (ident) {
        await handleIdentityAnswer(supabase, ownerId, cb.chatId, cb.callbackId, ident.action, ident.id)
        return
      }

      // Tap "✕ No es contacto" del ¿quién es quién?: "wq|<unmatchedId>" → descartar
      // (seguro/reversible). Nombrar-con-cara se hace en la app (botón url).
      if (cb.data.startsWith('wq|')) {
        const unmatchedId = cb.data.slice(3)
        if (unmatchedId) { await handleWhoIsWhoDismiss(supabase, ownerId, cb.chatId, cb.messageId, cb.callbackId, unmatchedId) }
        else await answerCallbackQuery(cb.callbackId)
        return
      }

      // Botón del BRIEF de la mañana: "br|<accion>|<ref>". El brief pasó de
      // párrafo a hilo accionable (elección de Aaron 2026-07-25) — cada sección
      // trae los botones de lo que esa señal SÍ permite hacer.
      const brief = parseBriefCallback(cb.data)
      if (brief) {
        const res = await runBriefAction(supabase, ownerId, brief.kind, brief.ref, {
          askSirText: async (question) => {
            const r = await askSir({ supabase, userId: ownerId, question, chatStyle: true, skipInlineGaps: true })
            return r.answer
          },
          // El lote de organizaciones lleva sus 30 handles en el texto del mensaje:
          // no caben en los 64 bytes del callback_data, y una tabla de lotes
          // pendientes sería estado que se puede quedar huérfano.
          messageText: cb.messageText ?? '',
        })
        await answerCallbackQuery(cb.callbackId, res.toast)
        // El resultado queda DONDE estaba el botón: se reemplaza el teclado por
        // el desenlace, así el hilo no acumula botones ya usados.
        await editTelegramKeyboard(cb.chatId, cb.messageId, `${cb.messageText ?? ''}\n\n${res.toast}`.trim().slice(0, 4000), [])
        if (res.reply) {
          await sendTelegramMessage(cb.chatId, res.reply)
          try {
            await supabase.from('sir_messages').insert({ user_id: ownerId, role: 'sir', content: res.reply.slice(0, 4000), channel: 'telegram' })
          } catch { /* fail-open: el hilo unificado es un extra */ }
        }
        await trackServer('brief_action', { channel: 'telegram', kind: brief.kind }, ownerId)
        return
      }

      const parts = cb.data.split('|')
      if (parts[0] !== 'sv' || parts.length < 3) { await answerCallbackQuery(cb.callbackId); return }
      const pendingId = parts[1]
      const confirm = parts[2] === '1'

      const action = await loadPendingAction(supabase, ownerId, pendingId)
      if (!action) {
        await answerCallbackQuery(cb.callbackId, 'Ya no está disponible')
        await editTelegramMessageText(cb.chatId, cb.messageId, 'Esta propuesta ya venció o se resolvió.')
        return
      }
      if (!confirm) {
        await deletePendingAction(supabase, ownerId, pendingId)
        await answerCallbackQuery(cb.callbackId, 'Descartado')
        await editTelegramMessageText(cb.chatId, cb.messageId, '✗ Listo, no guardé nada.')
        return
      }
      const result = await executeProposedAction(supabase, ownerId, action)
      await deletePendingAction(supabase, ownerId, pendingId)
      await answerCallbackQuery(cb.callbackId, result.ok ? 'Guardado ✓' : 'No se pudo')
      await editTelegramMessageText(cb.chatId, cb.messageId, result.message)
      if (result.ok) await trackServer('sir_action_confirmed', { channel: 'telegram', kind: action.kind }, ownerId)
    })
    return NextResponse.json({ ok: true })
  }

  const msg = parseTelegramUpdate(payload)
  if (!msg) return NextResponse.json({ ok: true })

  // Ack rápido + proceso en background (Telegram reintenta si tardamos).
  after(async () => {
    // Bootstrap: si aún no fijaste tu chat_id, te lo devuelvo para que lo setees.
    if (!allowedChat) {
      await sendTelegramMessage(
        msg.chatId,
        `👋 Soy SIR. Tu chat_id es: ${msg.chatId}\n\nSeteá TELEGRAM_ALLOWED_CHAT_ID=${msg.chatId} en Vercel (Production) y redesplega para activarme. Hasta entonces no proceso mensajes por seguridad.`,
      )
      return
    }
    // Allowlist: solo tu chat. Otro remitente → silencio.
    if (String(msg.chatId) !== allowedChat) return
    if (!svcUrl || !svcKey) return

    const supabase = createServiceClient(svcUrl, svcKey, { auth: { persistSession: false } })
    const ownerId = await resolveOwnerId(supabase)
    if (!ownerId) {
      await sendTelegramMessage(msg.chatId, 'Falta configurar TELEGRAM_OWNER_USER_ID en el server 🙏.')
      return
    }

    // FOTO: screenshot social (story de IG / perfil) → señal de timing. Camino
    // mobile-native (Aaron usa IG en el celu). Se procesa aparte del cerebro Q&A.
    if (msg.photoFileId) {
      await handleSocialPhoto(supabase, ownerId, msg.chatId, msg.photoFileId, msg.caption)
      return
    }

    // Resolver el texto de la consulta: directo, o transcribiendo la nota de voz
    // con Whisper (mismo pipeline que WhatsApp).
    let text = msg.text
    if (!text && msg.isVoice && msg.voiceFileId) {
      const media = await downloadTelegramFile(msg.voiceFileId)
      if (!media) {
        await sendTelegramMessage(msg.chatId, 'No pude bajar el audio 😕. Prueba de nuevo o escríbeme.')
        return
      }
      try { text = (await transcribeAudio(media.bytes, media.mimeType)).trim() } catch { text = '' }
      if (!text) {
        await sendTelegramMessage(msg.chatId, 'No le entendí al audio 😅. ¿Me lo repites o lo escribes?')
        return
      }
    }
    if (!text) return

    // Comandos del bot (/start, /help): bienvenida — no van al cerebro.
    if (text.startsWith('/')) {
      const cmd = text.slice(1).split(/\s+/)[0].toLowerCase()
      if (cmd === 'start' || cmd === 'help') {
        await sendTelegramMessage(
          msg.chatId,
          'Soy SIR 🌿. Pregúntame lo que quieras sobre tu gente, tus objetivos o tu día — cruzo tu contexto y te respondo con lo que sé de ti. También te leo notas de voz. Escríbeme nomas.',
        )
        return
      }
      // Comando desconocido → sigue como pregunta normal (no cortamos).
    }

    // Check-in de hábitos a pedido: "hábitos" / "/habitos" → botones para marcar.
    const norm = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^\//, '').trim()
    if (norm === 'habitos' || norm === 'habito' || norm === 'mis habitos') {
      const n = await sendHabitCheckin(supabase, ownerId, msg.chatId, new Date())
      if (n === 0) await sendTelegramMessage(msg.chatId, '✅ Ya marcaste todos tus hábitos de hoy. Bien ahí.')
      return
    }

    // "¿Quién es quién?": si este texto responde la pregunta del reader (trae
    // @handles que están pendientes), lo procesamos acá y NO lo mandamos al chat.
    // Conservador: si no hay handles pendientes, sigue como pregunta normal.
    try {
      // Si RESPONDIÓ a una tarjeta de identidad (foto + "¿persona o empresa?"), el
      // @handle está en el pie citado → alcanza con que escriba el nombre pelado.
      // Así no hace falta guardar "cuál fue la última pregunta": el mensaje citado
      // lleva el dato, y no hay estado que se pueda desincronizar.
      // Si RESPONDIÓ al lote de organizaciones con números ("3, 7"), esos quedan
      // pendientes y el resto se registra. Va ANTES del who-is-who porque un "3, 7"
      // pelado no tiene nada que ese flujo pueda interpretar.
      const textoLote = msg.replyTo?.fromBot ? (msg.replyTo.text ?? '') : ''
      const handlesLote = parseOrgBatch(textoLote)
      if (handlesLote.length > 0) {
        const fuera = parseExclusiones(text, handlesLote.length)
        if (fuera.length > 0) {
          const excluidos = fuera.map((i) => handlesLote[i])
          const aRegistrar = handlesLote.filter((_, i) => !fuera.includes(i))
          const res = await orgBatchApply(supabase, ownerId, aRegistrar, new Date())
          if (excluidos.length > 0) {
            await supabase.from('unmatched_social_activity')
              .update({ asked_at: new Date().toISOString() })
              .eq('user_id', ownerId).in('handle', excluidos)
          }
          await sendTelegramMessage(msg.chatId,
            `${res.toast}\nDejé pendientes: ${excluidos.map((h) => `@${h}`).join(', ')}.`)
          return
        }
      }

      const citado = msg.replyTo?.fromBot ? handleFromCaption(msg.replyTo.text) : null
      const textoWhois = citado && !/@[a-zA-Z0-9._]{2,30}/.test(text) ? `@${citado} ${text}` : text
      const whois = await resolveWhoIsWho(supabase, ownerId, textoWhois)
      if (whois.handled) { await sendTelegramMessage(msg.chatId, whois.reply); return }
    } catch { /* fail-open: si algo falla, cae al chat normal */ }

    try {
      // Hilo unificado (Fase 2): traigo el historial cross-canal para continuidad
      // multi-turno (ve también lo hablado por la web). Fail-open → [].
      const history = await getSirThread(supabase, ownerId, 12)
      const result = await askSir({
        supabase,
        userId: ownerId,
        question: text,
        history,
        // MVP: sin el ida-vuelta de gaps aclaratorios por chat; respuesta directa.
        skipInlineGaps: true,
        // Telegram es un chat: breve, conversacional, sin markdown (el ** se veía crudo).
        chatStyle: true,
        // RESPONDER CITANDO: si Aaron citó un mensaje de SIR (el brief llega en
        // 3 mensajes — ⚡ hoy / 💚 tu gente / 🎯 tus metas), ese texto ES el
        // referente de "ciérralo" / "escríbele". Sin esto, contestarle a un
        // mensaje viejo se leía como una pregunta suelta y SIR no sabía de qué
        // se hablaba. Solo cuenta lo citado del BOT; citarse a sí mismo no aporta.
        ...(msg.replyTo?.fromBot ? { quotedMessage: msg.replyTo.text } : {}),
      })
      // toPlainText garantiza que no viajen ** ## --- crudos a Telegram (el
      // chatStyle del prompt ayuda, esto lo asegura aunque el modelo desobedezca).
      const reply = toPlainText(result.answer)
      // El turno se persiste ANTES de mandar la respuesta, y no después, porque el
      // timestamp que devuelve es el id que llevan los botones de 👍/👎: sin él no
      // hay a qué atar el voto. Es fail-open (devuelve null si falla) → en ese caso
      // la respuesta sale igual, solo sin botones.
      const persistido = await appendSirThread(supabase, ownerId, 'telegram', text, result.answer)
      // 👍/👎 EN TELEGRAM. No existían: `chat_feedback` llevaba 0 filas desde que se
      // construyó y se le venía pidiendo a Aaron que calificara, cuando en su canal
      // principal no había dónde. La tabla ya aceptaba channel='telegram' desde el
      // día uno; solo faltaba el botón.
      await sendTelegramMessage(msg.chatId, reply, feedbackButtons(persistido?.sirAt))
      // GA4 server-side: sin esto el uso por Telegram no aparece en analytics.
      await trackServer('sir_asked', { channel: 'telegram', input_type: msg.isVoice ? 'voice' : 'text' }, ownerId)

      // CAPTURA DE NOTAS: si Aaron DICTÓ una acción (no solo preguntó), SIR la
      // propone con botones para que confirme. Nunca escritura silenciosa: se
      // guarda pendiente y solo se ejecuta al tap de "✅ Guardar".
      const pa = result.proposedAction
      if (pa && isExecutableByChat(pa.kind)) {
        const pendingId = await savePendingAction(supabase, ownerId, pa)
        if (pendingId) {
          await sendTelegramMessage(msg.chatId, summarizeActionForConfirm(pa), [
            { text: '✅ Guardar', callbackData: `sv|${pendingId}|1` },
            { text: '✗ Descartar', callbackData: `sv|${pendingId}|0` },
          ])
        }
      }
    } catch (e) {
      if (e instanceof AskSirConfigError) {
        await sendTelegramMessage(msg.chatId, 'Me falta una API key en el server para pensar 🤔. Avísale a Aaron.')
      } else {
        // eslint-disable-next-line no-console
        console.warn('[telegram] askSir falló:', e instanceof Error ? e.message : e)
        await sendTelegramMessage(msg.chatId, 'Uf, no pude procesarlo ahora. Reintenta en un momento 🙏')
      }
    }
  })

  return NextResponse.json({ ok: true })
}
