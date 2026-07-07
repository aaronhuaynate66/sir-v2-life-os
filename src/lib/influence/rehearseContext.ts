// SIR V2 — Contexto rico para la Sala de Ensayo. Junta lo que SIR ya sabe para
// que los escenarios sean de CALIDAD y aterrizados, no genéricos:
//   - ciclo + atunamiento (M6) — SOLO vínculo romántico, marco de CUIDADO,
//     nunca de táctica (docs 16/17: el contexto para conectar mejor, no manejar).
//   - tu propio estado (sueño/energía/ánimo) — auto-conciencia, para que TE cuides.
//   - el Pulso de la conversación (C0) — cómo viene el ritmo/tono/iniciativa.
// Best-effort: cada bloque falla en silencio si no hay data.

import type { SupabaseClient } from '@supabase/supabase-js'

import { cyclePhase } from '@/lib/ciclo/phase'
import { intimacyGuidance } from '@/lib/ciclo/intimacy'
import { getConversationMessages } from '@/lib/conversation-analytics/fromObservations'
import { analyzeConversation } from '@/lib/conversation-analytics/analyze'

export interface RehearsePerson {
  id: string
  relationship?: string | null
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
}

export interface RehearseExtras {
  cycleNote?: string
  selfState?: string
  pulse?: string
}

export async function gatherRehearseExtras(
  supabase: SupabaseClient,
  userId: string,
  person: RehearsePerson,
  nowMs: number,
): Promise<RehearseExtras> {
  const extras: RehearseExtras = {}

  // 1) Ciclo + atunamiento (M6) — SOLO romántico, marco de CUIDADO.
  if (person.relationship === 'romantic' && person.cycleStartDate) {
    try {
      const cp = cyclePhase(person.cycleStartDate, person.cycleLengthDays ?? 28, new Date(nowMs))
      if (cp) {
        const g = intimacyGuidance(cp)
        extras.cycleNote = [
          `Fase del ciclo de ella (contexto de ATUNAMIENTO, para acompañar mejor — NUNCA para cronometrar ni manejar): día ${cp.cycleDay}, ${cp.phase}${cp.isFertileWindow ? ' (ventana fértil aprox.)' : ''}.`,
          g.phaseNote,
          `Lo que más pesa: ${g.lever}`,
          `Límite: ${g.caution}`,
        ].join(' ')
      }
    } catch { /* best-effort */ }
  }

  // 2) Tu estado (auto-conciencia).
  try {
    const [sleepRes, metricsRes] = await Promise.all([
      supabase.from('sleep_records').select('duration, score').eq('user_id', userId).order('date', { ascending: false }).limit(1),
      supabase.from('self_metrics').select('category, value').eq('user_id', userId).in('category', ['energy', 'mood']).order('measured_at', { ascending: false }).limit(4),
    ])
    const s = (sleepRes.data as Array<{ duration: number; score: number | null }> | null)?.[0]
    const metrics = (metricsRes.data as Array<{ category: string; value: number }> | null) ?? []
    const parts: string[] = []
    if (s) parts.push(`dormiste ${Number(s.duration).toFixed(1)}h${s.score ? ` (score ${s.score})` : ''}`)
    const energy = metrics.find((m) => m.category === 'energy')
    const mood = metrics.find((m) => m.category === 'mood')
    if (energy) parts.push(`energía ${energy.value}/10`)
    if (mood) parts.push(`ánimo ${mood.value}/10`)
    if (parts.length) {
      const low = s && Number(s.duration) < 6
      extras.selfState =
        `Tu estado ahora (auto-conciencia, para que TE cuides en la conversa): ${parts.join(', ')}.` +
        (low ? ' Dormiste poco → ojo con la paciencia y la reactividad; no es momento de discusiones que puedan esperar.' : '')
    }
  } catch { /* best-effort */ }

  // 3) Pulso de la conversación (C0).
  try {
    const msgs = await getConversationMessages(supabase, userId, person.id)
    if (msgs.length >= 6) {
      const a = analyzeConversation(msgs, nowMs)
      const bits: string[] = []
      if (a.tone) bits.push(`tono ${a.tone.direction}`)
      if (a.volume) bits.push(`volumen ${a.volume.direction}${a.volume.changePoint ? ` (${a.volume.changePoint.direction} hace poco)` : ''}`)
      if (a.myInitiationShare != null) bits.push(`vos iniciás el ${Math.round(a.myInitiationShare * 100)}% de las charlas`)
      if (a.cadence) bits.push(`se hablan ~cada ${a.cadence.medianGapDays.toFixed(1)} días`)
      if (bits.length) extras.pulse = `Pulso de la conversación (dinámica reciente): ${bits.join(', ')}.`
    }
  } catch { /* best-effort */ }

  return extras
}
