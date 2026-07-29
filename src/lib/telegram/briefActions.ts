// SIR V2 — Ejecutor de los botones del brief de la mañana (hilo por secciones).
//
// El brief pasó de párrafo a hilo con botones (elección de Aaron 2026-07-25). Acá
// vive lo que hace cada botón; el webhook solo rutea. Todo devuelve un mensaje
// corto para editar el mensaje del brief — el resultado se ve donde estaba el
// botón, sin abrir la app.
//
// FAIL-SOFT: cualquier error devuelve un mensaje honesto, nunca lanza.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BriefActionKind } from './briefThread'
import { nombreDesdeHandle, parseOrgBatch } from '@/lib/social-reader/orgBatch'
import { inferParentOrg, orgSlug } from '@/lib/social-reader/entityKind'

export interface BriefActionResult {
  /** Texto corto para el toast del botón (Telegram lo corta a ~200). */
  toast: string
  /** Si viene, se manda como mensaje aparte (un borrador, un próximo paso…). */
  reply?: string
}

/** Hoy a las 18:00 de Lima, en ISO UTC (Lima = UTC-5, sin horario de verano). */
export function todaySixPmLimaISO(now: Date): string {
  const limaKey = new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)
  return `${limaKey}T23:00:00.000Z`
}

async function taskDone(supabase: SupabaseClient, userId: string, taskId: string): Promise<BriefActionResult> {
  const { data, error } = await supabase
    .from('objective_steps')
    .update({ status: 'hecho' })
    .eq('user_id', userId).eq('id', taskId)
    .select('title')
    .maybeSingle()
  if (error || !data) return { toast: 'No pude marcarla, inténtalo desde la app.' }
  return { toast: `✅ ${(data as { title: string }).title}` }
}

/**
 * "💼 Registrar oportunidad" → crea el DEAL que faltaba y marca la señal.
 *
 * Es el cierre del loop que Aaron reclamó el 28-jul: SIR detectaba la ventana con
 * Miluska y no pasaba nada. Ahora, de un toque, la oportunidad entra al pipeline
 * con la cita textual como respaldo de por qué existe.
 */
async function opportunityRegister(
  supabase: SupabaseClient, userId: string, signalId: string, now: Date,
): Promise<BriefActionResult> {
  const { data: sig } = await supabase
    .from('opportunity_signals')
    .select('id, person_id, person_name, what, quote, quote_at, state, deal_id')
    .eq('user_id', userId).eq('id', signalId).maybeSingle()
  const s = sig as {
    person_id: string; person_name: string; what: string; quote: string
    quote_at: string; state: string; deal_id: string | null
  } | null
  if (!s) return { toast: 'No encontré esa señal.' }
  // Idempotente: si ya se registró, no crea un deal duplicado.
  if (s.state === 'registered' && s.deal_id) return { toast: `Ya estaba registrada como oportunidad.` }

  const dealId = `deal_opp_${signalId.replace(/^opp_/, '').slice(0, 24)}`
  const { error: dealErr } = await supabase.from('deals').upsert({
    id: dealId,
    user_id: userId,
    title: `${s.what} — ${s.person_name}`,
    stage: 'lead',
    status: 'open',
    currency: 'PEN',
    contact_person_id: s.person_id,
    source: 'Detectado en conversación (SIR)',
    next_action: `Responderle a ${s.person_name.split(/\s+/)[0]} sobre ${s.what}`,
    why_matters: `Lo pidió ella/él mismo el ${s.quote_at.slice(0, 10)}: «${s.quote.slice(0, 300)}»`,
    updated_at: now.toISOString(),
  }, { onConflict: 'id' })
  // PostgREST no lanza: el error viene en `.error` (trampa de #947).
  if (dealErr) return { toast: 'No pude crear la oportunidad, inténtalo desde la app.' }

  await supabase.from('opportunity_signals')
    .update({ state: 'registered', deal_id: dealId, resolved_at: now.toISOString() })
    .eq('user_id', userId).eq('id', signalId)
  return { toast: `💼 Registrada: ${s.what.slice(0, 60)}` }
}

/** "✕ No es negocio" → la señal no vuelve. Tan importante como el sí: sin esto el
 *  detector repetiría lo descartado y se volvería ruido. */
async function opportunityDismiss(
  supabase: SupabaseClient, userId: string, signalId: string, now: Date,
): Promise<BriefActionResult> {
  const { error } = await supabase.from('opportunity_signals')
    .update({ state: 'dismissed', resolved_at: now.toISOString() })
    .eq('user_id', userId).eq('id', signalId)
  if (error) return { toast: 'No pude descartarla.' }
  return { toast: '✕ Listo, no te la vuelvo a mostrar.' }
}

async function taskRemind(
  supabase: SupabaseClient, userId: string, taskId: string, now: Date,
): Promise<BriefActionResult> {
  const { data: step } = await supabase
    .from('objective_steps').select('title').eq('user_id', userId).eq('id', taskId).maybeSingle()
  const title = (step as { title?: string } | null)?.title
  if (!title) return { toast: 'No encontré esa tarea.' }
  const { error } = await supabase.from('reminders').insert({
    user_id: userId,
    text: title.slice(0, 500),
    due_at: todaySixPmLimaISO(now),
  })
  if (error) return { toast: 'No pude agendar el recordatorio.' }
  return { toast: '⏰ Te lo recuerdo hoy 6pm' }
}

async function momentClose(supabase: SupabaseClient, userId: string, momentId: string): Promise<BriefActionResult> {
  const { data, error } = await supabase
    .from('relationship_moments')
    .update({ status: 'cerrado' })
    .eq('user_id', userId).eq('id', momentId)
    .select('title')
    .maybeSingle()
  if (error || !data) return { toast: 'No pude cerrarlo, inténtalo desde la app.' }
  return { toast: `✅ Cerrado: ${(data as { title: string }).title}`.slice(0, 190) }
}

/**
 * 🔕: el tema deja de aparecer en el brief. Resuelve la `ref` corta del botón
 * contra el log de lo enviado (brief_sent_signals) para obtener el topic_key
 * estable — así el silencio sobrevive a que el texto se reformule.
 */
async function mute(supabase: SupabaseClient, userId: string, ref: string): Promise<BriefActionResult> {
  const { data: sent } = await supabase
    .from('brief_sent_signals')
    .select('topic_key, sample_text, section')
    .eq('user_id', userId).eq('ref', ref)
    .maybeSingle()
  const row = sent as { topic_key: string; sample_text: string; section: string | null } | null
  if (!row?.topic_key) return { toast: 'Ya no tengo esa señal a la mano.' }
  const { error } = await supabase.from('brief_mutes').upsert({
    user_id: userId, topic_key: row.topic_key, sample_text: row.sample_text, section: row.section,
  }, { onConflict: 'user_id,topic_key' })
  if (error) return { toast: 'No pude silenciarlo.' }
  return { toast: '🔕 Listo, no te lo repito más' }
}

/**
 * "✅ Sí, las N" del lote de organizaciones → crea las `org_profiles` y saca esos
 * handles de la bandeja.
 *
 * Los handles NO vienen en el `ref` (Telegram corta `callback_data` en 64 bytes y
 * no caben 30): los recupera el caller del TEXTO del mensaje y los pasa acá. Ver
 * orgBatch.ts.
 *
 * Idempotente por `org_slug`: volver a tocar el botón no duplica nada. Y respeta la
 * jerarquía que Aaron describió —una compañía de bomberos cuelga del CGBVP— vía
 * `inferParentOrg`, que es la razón por la que `org_profiles.parent_org` existe.
 */
export async function orgBatchApply(
  supabase: SupabaseClient, userId: string, handles: string[], now: Date,
): Promise<BriefActionResult> {
  if (handles.length === 0) return { toast: 'Ya no tengo ese lote a la mano.' }

  const { data: existentes } = await supabase
    .from('org_profiles').select('org_slug, instagram_handle').eq('user_id', userId)
  const filas = (existentes ?? []) as Array<{ org_slug: string; instagram_handle: string | null }>
  const slugsExistentes = filas.map((o) => o.org_slug)
  const yaTengo = new Set(filas.map((o) => (o.instagram_handle ?? '').replace(/^@/, '').toLowerCase()).filter(Boolean))

  let creadas = 0, yaEstaban = 0
  for (const handle of handles) {
    if (yaTengo.has(handle)) { yaEstaban++; continue }
    const name = nombreDesdeHandle(handle)
    if (!name) continue
    const slug = orgSlug(name)
    const { error } = await supabase.from('org_profiles').upsert({
      id: `org_${slug}`.slice(0, 60), user_id: userId,
      org_slug: slug, name,
      instagram_handle: handle,
      parent_org: inferParentOrg(name, slugsExistentes),
      source: 'lote de Telegram (confirmado por Aaron)',
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id,org_slug' })
    // PostgREST no lanza: el error viene en `.error`. Una fila que falla no debe
    // abortar el lote — se cuenta como no creada y el handle se queda en la cola.
    if (!error) { creadas++; slugsExistentes.push(slug) }
  }

  // Solo se sacan de la bandeja los que efectivamente quedaron como organización.
  const aLimpiar = handles.filter((h) => yaTengo.has(h) || creadas > 0)
  if (aLimpiar.length > 0) {
    await supabase.from('unmatched_social_activity')
      .delete().eq('user_id', userId).in('handle', aLimpiar)
  }

  const partes = [creadas > 0 ? `🏢 ${creadas} organización${creadas === 1 ? '' : 'es'} registrada${creadas === 1 ? '' : 's'}` : null]
  if (yaEstaban > 0) partes.push(`${yaEstaban} ya estaban`)
  return { toast: partes.filter(Boolean).join(' · ') || 'No pude registrarlas.' }
}

/** "✕ Ninguna" → se marcan como preguntadas para que el lote no vuelva mañana,
 *  pero NO se borran: siguen siendo handles pendientes de identificar. */
export async function orgBatchDismiss(
  supabase: SupabaseClient, userId: string, handles: string[], now: Date,
): Promise<BriefActionResult> {
  if (handles.length === 0) return { toast: 'Ya no tengo ese lote a la mano.' }
  const { error } = await supabase.from('unmatched_social_activity')
    .update({ asked_at: now.toISOString() })
    .eq('user_id', userId).in('handle', handles)
  if (error) return { toast: 'No pude descartar el lote.' }
  return { toast: '✕ Listo, las dejo pendientes y no te repito este lote.' }
}

/**
 * Ejecuta el botón. `askSirText` lo inyecta el caller (el webhook) para las
 * acciones que necesitan pensar —borrador y próximo paso— y así este módulo no
 * depende del cerebro ni de HTTP. `messageText` lo inyecta también el webhook,
 * para las acciones cuyo estado vive en el texto del mensaje (el lote de orgs).
 */
export async function runBriefAction(
  supabase: SupabaseClient,
  userId: string,
  kind: BriefActionKind,
  ref: string,
  opts: { now?: Date; askSirText?: (question: string) => Promise<string>; messageText?: string } = {},
): Promise<BriefActionResult> {
  const now = opts.now ?? new Date()
  try {
    switch (kind) {
      case 'task_done': return await taskDone(supabase, userId, ref)
      case 'task_remind': return await taskRemind(supabase, userId, ref, now)
      case 'moment_close': return await momentClose(supabase, userId, ref)
      case 'mute': return await mute(supabase, userId, ref)
      case 'person_draft': {
        if (!opts.askSirText) return { toast: 'No puedo redactar ahora.' }
        const { data } = await supabase.from('people').select('name').eq('user_id', userId).eq('id', ref).maybeSingle()
        const name = (data as { name?: string } | null)?.name ?? 'esa persona'
        const reply = await opts.askSirText(
          `Escríbeme un mensaje corto, cálido y natural para mandarle a ${name} hoy, en mi voz. `
          + 'Basate en lo último que hablamos y en cómo está la relación. Dame SOLO el mensaje, listo para copiar.',
        )
        return { toast: '✍️ Te paso un borrador', reply }
      }
      case 'goal_next': {
        if (!opts.askSirText) return { toast: 'No puedo pensarlo ahora.' }
        const { data } = await supabase.from('goals').select('title').eq('user_id', userId).eq('id', ref).maybeSingle()
        const title = (data as { title?: string } | null)?.title ?? 'ese objetivo'
        const reply = await opts.askSirText(
          `¿Cuál es el próximo paso CONCRETO para "${title}"? Uno solo, accionable esta semana, `
          + 'con a quién involucra si aplica. Sé breve.',
        )
        return { toast: '🚀 Ahí va el próximo paso', reply }
      }
      case 'opp_reg': return await opportunityRegister(supabase, userId, ref, now)
      case 'opp_no': return await opportunityDismiss(supabase, userId, ref, now)
      // El lote de organizaciones lleva su estado en el TEXTO del mensaje, no en
      // el ref: 30 handles no caben en los 64 bytes del callback_data.
      case 'org_ok': return await orgBatchApply(supabase, userId, parseOrgBatch(opts.messageText ?? ''), now)
      case 'org_no': return await orgBatchDismiss(supabase, userId, parseOrgBatch(opts.messageText ?? ''), now)
      default: return { toast: 'No sé hacer eso todavía.' }
    }
  } catch {
    return { toast: 'Algo falló, inténtalo de nuevo.' }
  }
}
