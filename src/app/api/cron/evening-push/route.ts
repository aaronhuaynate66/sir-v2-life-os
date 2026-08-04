// SIR V2 — GET /api/cron/evening-push. Recordatorio SUAVE de la noche: UN solo
// push por usuario con los hábitos DIARIOS que siguen pendientes hoy. Lo dispara
// Vercel Cron (~21:00 Lima = 02:00 UTC). Si no hay pendientes, no se envía nada
// (buildEveningHabitsPush → null). No es una alarma por hábito: es un cierre de
// día gentil. Mismo patrón de auth/admin que morning-push.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser, vapidReady, type PushPayload } from '@/lib/push/send'
import { buildEveningHabitsPush, type EveningHabit } from '@/lib/habits/eveningPush'
import { isTelegramConfigured, sendTelegramMessage, sendTelegramKeyboard, sendTelegramPhoto } from '@/lib/telegram/client'
import { formatEveningBriefForChat } from '@/lib/telegram/eveningBrief'
import { pendingDailyHabits, habitCallbackData } from '@/lib/habits/checkinButtons'
import { buildWhoIsWhoKeyboard } from '@/lib/social-reader/whoIsWho'
import { buildIdentityCard, pickPhoto } from '@/lib/social-reader/askIdentity'
import { buildOrgBatch } from '@/lib/social-reader/orgBatch'
import { repartirLote } from '@/lib/social-reader/orgVerdict'
import { normalizeReaderProfile } from '@/lib/social-reader/igProfile'
import { briefCallbackData } from '@/lib/telegram/briefThread'
import { relacionesUrl } from '@/lib/app-url'
import { limaDayString } from '@/lib/habits/streak'
import { botonesDeToma, horaDeRecordatorioDeToma, fechaDeRecordatorioDeToma, cuandoDeLaToma, textoDeToma } from '@/lib/meds/telegramToma'
import { medsDeLaToma } from '@/lib/meds/tomaPendiente'
import { reportApiError } from '@/lib/observability/reportApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurada' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  // ═══ VAPID NO PUEDE TUMBAR EL CANAL QUE SÍ FUNCIONA ═══════════════════════
  //
  // Esto era un `return 503`. Con la toma de medicación viviendo acá (ver abajo),
  // eso significaba que una variable de entorno del Web Push —el canal cuya única
  // suscripción es de Apple y del 13-jun, y esas caducan— podía apagar en silencio
  // el aviso de las pastillas por Telegram, que está vivo.
  //
  // Ahora la falta de VAPID solo desactiva el Web Push. Es la misma lección de
  // [[alarma-silencio-reader-apagada]]: no colgar algo que importa de una señal
  // que puede faltar sin que nadie se entere.
  const pushReady = vapidReady()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Faltan envs de Supabase' }, { status: 500 })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  type SendClient = Parameters<typeof sendPushToUser>[0]
  const sendClient = admin as unknown as SendClient

  const { data: subRows, error: subErr } = await admin.from('push_subscriptions').select('user_id').limit(5000)
  if (subErr) return NextResponse.json({ error: 'No se pudieron leer suscripciones', detail: subErr.message }, { status: 500 })
  const userIds = [...new Set((subRows ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))]

  // Cierre del día por Telegram (invita a reflexionar/dictar notas). OPT-IN con
  // TELEGRAM_EVENING_BRIEF=1. Al dueño se le manda aunque no tenga Web Push.
  const briefEnabled = process.env.TELEGRAM_EVENING_BRIEF === '1' && isTelegramConfigured()
  const tgOwnerId = process.env.TELEGRAM_OWNER_USER_ID?.trim() || null
  const tgChat = process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim() || null
  if (briefEnabled && tgOwnerId && tgChat && !userIds.includes(tgOwnerId)) userIds.push(tgOwnerId)
  let telegramBriefs = 0

  const now = new Date()
  let sent = 0
  const results: Array<{ user: string; sent: number }> = []

  for (const uid of userIds) {
    try {
      const { data: habitRows } = await admin
        .from('habits')
        .select('id, title, cadence')
        .eq('user_id', uid)
        .eq('active', true)
        .limit(50)
      const habitList = (habitRows ?? []) as Array<{ id: string; title: string; cadence: string }>

      let push: { title: string; body: string } | null = null
      let pendingHabits: { id: string; title: string }[] = []
      if (habitList.length > 0) {
        const since = new Date(now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10)
        const { data: ckRows } = await admin
          .from('habit_checkins')
          .select('habit_id, date')
          .eq('user_id', uid)
          .gte('date', since)
          .limit(2000)
        const byHabit = new Map<string, string[]>()
        for (const c of (ckRows ?? []) as Array<{ habit_id: string; date: string }>) {
          const arr = byHabit.get(c.habit_id) ?? []
          arr.push(c.date)
          byHabit.set(c.habit_id, arr)
        }
        const habits: EveningHabit[] = habitList.map((h) => ({
          title: h.title,
          cadence: h.cadence === 'weekly' ? 'weekly' : 'daily',
          checkinDates: byHabit.get(h.id) ?? [],
        }))
        push = buildEveningHabitsPush(habits, now)
        // Hábitos diarios que faltan marcar hoy → botones (un toque, sin escribir).
        pendingHabits = pendingDailyHabits(
          habitList.map((h) => ({ id: h.id, title: h.title, cadence: h.cadence, checkinDates: byHabit.get(h.id) ?? [] })),
          limaDayString(now),
        )
      }

      // Web Push: solo si hay pendientes (comportamiento original) y si VAPID está.
      if (push && pushReady) {
        const payload: PushPayload = { title: push.title, body: push.body, url: '/habitos', tag: 'evening-habits' }
        const r = await sendPushToUser(sendClient, uid, payload)
        sent += r.sent
      }

      // Telegram: cierre del día al dueño, INDEPENDIENTE de si hay hábitos
      // pendientes (la invitación a reflexionar/dictar vale igual).
      if (briefEnabled && tgOwnerId && tgChat && uid === tgOwnerId) {
        const chatText = formatEveningBriefForChat(push?.body)
        const tg = await sendTelegramMessage(Number(tgChat), chatText)
        if (tg.ok) {
          telegramBriefs++
          try {
            await admin.from('sir_messages').insert({ user_id: uid, role: 'sir', content: chatText.slice(0, 4000), channel: 'telegram' })
          } catch { /* fail-open */ }
        }
        // ═══ LA TOMA DE LA NOCHE, A SU HORA ══════════════════════════════════
        //
        // Aaron, 4-ago-2026: *"anoche te dije que la mayoría eran ANTES DE DORMIR,
        // entonces qué sentido tiene que me pregunte en la mañana si las acabo de
        // tomar si el objetivo es tomarlas en la noche"*.
        //
        // El aviso vivía SOLO en `reminders-due` (06:00 de Lima, con 36 h de
        // anticipación), así que la toma de las 22:00 se anunciaba 16 h antes y se
        // cerraba con `notified_at` sin volver. No había ningún cron entre las 21:00
        // y las 03:00 que avisara cerca de la hora real: este es el que faltaba.
        //
        // Corre a las 21:00 de Lima → una hora antes de la toma de las 22:00. Se
        // marca `notified_at` sólo si Telegram entregó; si no, `reminders-due`
        // mañana la ve vencida y pregunta "¿tomaste la de anoche?".
        try {
          const desde = new Date(now.getTime() - 2 * 3_600_000).toISOString()
          const hasta = new Date(now.getTime() + 4 * 3_600_000).toISOString()
          const { data: remRows } = await admin
            .from('reminders')
            .select('id, due_at')
            .eq('user_id', uid)
            .is('done_at', null).is('notified_at', null)
            .gte('due_at', desde).lte('due_at', hasta)
            .limit(20)
          const hoyLima = limaDayString(now)
          for (const rem of (remRows ?? []) as Array<{ id: string; due_at: string | null }>) {
            const hora = horaDeRecordatorioDeToma(rem.id)
            if (!hora) continue // no es una toma: no es asunto de este bloque
            const meds = await medsDeLaToma(admin, uid, hora)
            const filas = meds.length > 0 ? botonesDeToma(meds, hora) : []
            if (filas.length === 0) continue
            const cuando = cuandoDeLaToma(fechaDeRecordatorioDeToma(rem.id), hoyLima)
            const tg = await sendTelegramKeyboard(Number(tgChat), textoDeToma(meds, hora, cuando), filas)
            if (tg.ok) {
              await admin.from('reminders').update({ notified_at: new Date().toISOString() }).eq('id', rem.id)
            }
          }
        } catch (e) {
          reportApiError(e, { route: 'cron/evening-push', step: 'tomaDeLaNoche', user: uid.slice(0, 8) })
        }

        // Check-in de hábitos por BOTONES (Aaron: más UX-friendly que escribir "ya
        // medité"). Un botón por hábito diario pendiente; el tap lo marca (callback
        // "hb|<id>" → webhook). Solo si quedan pendientes.
        if (pendingHabits.length > 0) {
          const rows = pendingHabits.slice(0, 8).map((h) => [{ text: `✅ ${h.title}`, callbackData: habitCallbackData(h.id) }])
          await sendTelegramKeyboard(Number(tgChat), '¿Cuáles de tus hábitos hiciste hoy? Toca los que sí 👇', rows)
        }

        // "¿QUIÉN ES QUIÉN?": handles de IG que el reader vio pero no están
        // asignados a un contacto. SIR pregunta acá (Aaron responde "@handle
        // Nombre" y el webhook lo matchea). Throttle por asked_at → no re-pregunta
        // los mismos. Fail-soft si la tabla 0152/0154 no propagó.
        try {
          const { data: un } = await admin
            .from('unmatched_social_activity')
            .select('id, handle, name, avatar_url, avatar_path, detail')
            .eq('user_id', uid).eq('platform', 'instagram').eq('kind', 'available')
            .is('asked_at', null).not('handle', 'is', null)
            .order('observed_at', { ascending: false }).limit(10)
          const rows = (un ?? []) as Array<{ id: string; handle: string; name: string | null; avatar_url: string | null; avatar_path: string | null; detail: string | null }>

          // ── LOTE DE ORGANIZACIONES, antes que la tarjeta de a una ──────────
          //
          // A una cuenta por noche, las 103 de la bandeja son 103 noches. Y para
          // una empresa la foto no aporta: nadie reconoce a @panoramaoutsourcing
          // por su logo — lo que decide es la palabra que está en el handle, y eso
          // se lee de 30 de golpe.
          //
          // Se piden aparte (sin el filtro de asked_at ni el límite de 10) porque
          // la cola de la tarjeta y la del lote son colas distintas: 44 de las 103
          // son clasificables hoy, y no tienen por qué esperar su turno de foto.
          let loteMandado = false
          try {
            const { data: todos } = await admin
              .from('unmatched_social_activity')
              .select('handle, name')
              .eq('user_id', uid).eq('platform', 'instagram').eq('kind', 'available')
              .is('asked_at', null).not('handle', 'is', null).limit(1000)
            const candidatas = (todos ?? []) as Array<{ handle: string; name: string | null }>

            // El perfil declarado por IG le gana al handle, así que se trae si está.
            const { data: perfiles } = await admin
              .from('social_profiles')
              .select('handle, full_name, category, followers_count, is_business, is_verified')
              .eq('user_id', uid).limit(1000)
            const porHandle = new Map(
              ((perfiles ?? []) as Array<Record<string, unknown>>).map((p) => [String(p.handle ?? '').toLowerCase(), p]),
            )

            const { orgs } = repartirLote(candidatas.map((c) => {
              const p = porHandle.get(c.handle.toLowerCase())
              return {
                handle: c.handle,
                name: c.name,
                perfil: p ? normalizeReaderProfile(p) : null,
              }
            }))

            // Con menos de 3 no vale un lote: eso lo resuelve la tarjeta de a una.
            if (orgs.length >= 3) {
              const lote = buildOrgBatch(
                orgs.map((o) => ({ handle: o.handle, razon: o.veredicto.razon })),
                briefCallbackData('org_ok', 'lote'),
                briefCallbackData('org_no', 'lote'),
              )
              if (lote) {
                const tg = await sendTelegramKeyboard(Number(tgChat), lote.text, lote.keyboard)
                if (tg.ok) {
                  loteMandado = true
                  // Se marcan como preguntadas para que el lote no se repita mañana
                  // si no contesta. Si confirma, la acción las borra de la bandeja.
                  await admin.from('unmatched_social_activity')
                    .update({ asked_at: new Date().toISOString() })
                    .eq('user_id', uid).in('handle', lote.handles)
                }
              }
            }
          } catch (e) {
            reportApiError(e, { route: 'cron/evening-push', step: 'loteOrgs', user: uid.slice(0, 8) })
          }

          // TARJETA CON LA CARA, de a UNA (Aaron 28-jul: "ya me aburrí del excel,
          // que SIR me pregunte pasivamente si es tal persona o si es una empresa").
          // Se prefiere ESTO sobre la lista de ✕ cuando hay foto: la razón por la
          // que #942 no dejaba nombrar desde Telegram era que "no puede mostrar la
          // CARA" — con la foto adentro, sí puede, y de paso se pregunta lo que
          // faltaba en todas las superficies: persona o empresa.
          // Una sola pregunta de identidad por noche: si ya salió el lote, la
          // tarjeta con la cara espera a mañana. (Guarda, no `return`: acá estamos
          // dentro del for de usuarios y un return cortaría a los demás.)
          const conFoto = loteMandado ? undefined : rows.find((r) => r.avatar_url || r.avatar_path)
          if (conFoto) {
            const perfil = await admin
              .from('social_profiles')
              .select('full_name, category, followers_count')
              .eq('user_id', uid).eq('handle', conFoto.handle).maybeSingle()
            const p = perfil.data as { full_name: string | null; category: string | null; followers_count: number | null } | null
            const pistas = [conFoto.name, p?.full_name, p?.category, conFoto.detail].filter(Boolean).join(' · ')
            const { caption, keyboard } = buildIdentityCard({
              id: conFoto.id, handle: conFoto.handle,
              hint: pistas || null,
              followers: p?.followers_count ?? null,
            })
            // La URL de IG CADUCA (medido: hoy 200, mañana no). El snapshot en
            // Storage no expira pero el bucket es privado → hay que firmarlo.
            let firmada: string | null = null
            if (conFoto.avatar_path) {
              const { data: signed } = await admin.storage
                .from('person-avatars')
                .createSignedUrl(conFoto.avatar_path, 60 * 60 * 24 * 7)
              firmada = signed?.signedUrl ?? null
            }
            const foto = pickPhoto({ signedSnapshotUrl: firmada, avatarUrl: conFoto.avatar_url })
            const tg = foto ? await sendTelegramPhoto(Number(tgChat), foto, caption, keyboard) : { ok: false }
            if (tg.ok) await admin.from('unmatched_social_activity').update({ asked_at: new Date().toISOString() }).eq('id', conFoto.id)
            else reportApiError(new Error('sendPhoto falló en la tarjeta de identidad'), { route: 'cron/evening-push', handle: conFoto.handle, teniaFirmada: !!firmada, teniaUrl: !!conFoto.avatar_url })
          } else if (!loteMandado && rows.length > 0) {
            // Sin foto no hay nada que mirar → se mantiene la lista de ✕ (descartar
            // es la única acción segura cuando solo se ve el @).
            const { text, keyboard } = buildWhoIsWhoKeyboard(rows, relacionesUrl())
            const tg = await sendTelegramKeyboard(Number(tgChat), text, keyboard)
            if (tg.ok) await admin.from('unmatched_social_activity').update({ asked_at: new Date().toISOString() }).in('id', rows.map((r) => r.id))
          }
        } catch (e) {
          // Fail-soft, pero con traza: antes un error acá no dejaba rastro.
          reportApiError(e, { route: 'cron/evening-push', step: 'askIdentity', user: uid.slice(0, 8) })
        }
      }
      results.push({ user: uid.slice(0, 8), sent: push ? 1 : 0 })
    } catch (e) {
      // Antes se tragaba en silencio: un bug lógico rompía el brief nocturno y el
      // push degradaba a vacío sin traza (mismo fix que morning-push). Fail-soft
      // por-usuario, pero AHORA con telemetría.
      reportApiError(e, { route: 'cron/evening-push', user: uid.slice(0, 8) })
      results.push({ user: uid.slice(0, 8), sent: 0 })
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, pushReady, sent, telegramBriefs, results }, { status: 200 })
}
