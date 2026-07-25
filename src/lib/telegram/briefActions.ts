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
 * Ejecuta el botón. `askSirText` lo inyecta el caller (el webhook) para las
 * acciones que necesitan pensar —borrador y próximo paso— y así este módulo no
 * depende del cerebro ni de HTTP.
 */
export async function runBriefAction(
  supabase: SupabaseClient,
  userId: string,
  kind: BriefActionKind,
  ref: string,
  opts: { now?: Date; askSirText?: (question: string) => Promise<string> } = {},
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
      default: return { toast: 'No sé hacer eso todavía.' }
    }
  } catch {
    return { toast: 'Algo falló, inténtalo de nuevo.' }
  }
}
