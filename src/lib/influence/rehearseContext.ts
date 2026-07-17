// SIR V2 — Contexto rico para la Sala de Ensayo. Junta lo que SIR ya sabe para
// que los escenarios sean de CALIDAD y aterrizados, no genéricos:
//   - ciclo + atunamiento (M6) — SOLO vínculo romántico, marco de CUIDADO,
//     nunca de táctica (docs 16/17: el contexto para conectar mejor, no manejar).
//   - el Pulso de la conversación (C0) — cómo viene el ritmo/tono/iniciativa.
//   - temas ABIERTOS con la persona — lo que puede aparecer en la conversación
//     (moments sin cerrar). Es la señal de más valor para un ensayo.
// (El estado bio de Aaron lo arma el route aparte, vía getSelfBioState.)
// Best-effort: cada bloque falla en silencio si no hay data. Las consultas van en
// PARALELO para no sumar latencia (el request vive dentro del cap de 60s de Hobby).

import type { SupabaseClient } from '@supabase/supabase-js'

import { cyclePhase } from '@/lib/ciclo/phase'
import { intimacyGuidance } from '@/lib/ciclo/intimacy'
import { getConversationMessages } from '@/lib/conversation-analytics/fromObservations'
import { analyzeConversation } from '@/lib/conversation-analytics/analyze'
import { forecastTrajectories } from '@/lib/prediction/c2/trajectory'

// Notas fechadas al import (no reflejan un contacto real) — se excluyen de la
// cadencia/tono, igual que en el motor de trayectoria C2.
const IMPORT_DATED = /^(Importado|Tono inferido|Conversación reciente)/i

export interface RehearsePerson {
  id: string
  relationship?: string | null
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
  lastContactMs?: number | null
}

export interface RehearseExtras {
  cycleNote?: string
  pulse?: string
  openThreads?: string
  bondState?: string
}

async function gatherPulse(supabase: SupabaseClient, userId: string, personId: string, nowMs: number): Promise<string | undefined> {
  try {
    const msgs = await getConversationMessages(supabase, userId, personId)
    if (msgs.length < 6) return undefined
    const a = analyzeConversation(msgs, nowMs)
    const bits: string[] = []
    if (a.tone) bits.push(`tono ${a.tone.direction}`)
    if (a.volume) bits.push(`volumen ${a.volume.direction}${a.volume.changePoint ? ` (${a.volume.changePoint.direction} hace poco)` : ''}`)
    if (a.myInitiationShare != null) bits.push(`tú inicias el ${Math.round(a.myInitiationShare * 100)}% de las charlas`)
    if (a.cadence) bits.push(`se hablan ~cada ${a.cadence.medianGapDays.toFixed(1)} días`)
    return bits.length ? `Pulso de la conversación (dinámica reciente): ${bits.join(', ')}.` : undefined
  } catch { return undefined }
}

async function gatherOpenThreads(supabase: SupabaseClient, userId: string, personId: string): Promise<string | undefined> {
  try {
    const { data } = await supabase
      .from('relationship_moments')
      .select('title, detail')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .eq('status', 'abierto')
      .order('created_at', { ascending: false })
      .limit(4)
    const rows = (data as Array<{ title: string | null; detail: string | null }> | null) ?? []
    if (rows.length === 0) return undefined
    const items = rows
      .map((m) => (m.title ?? '').trim() + (m.detail ? ` — ${m.detail.trim().slice(0, 100)}` : ''))
      .filter((s) => s.length > 0)
    if (items.length === 0) return undefined
    return `Temas ABIERTOS con ella (pueden aparecer en la conversación — no los fuerces, pero estate preparado): ${items.join(' · ')}.`
  } catch { return undefined }
}

async function gatherBondState(supabase: SupabaseClient, userId: string, person: RehearsePerson, nowMs: number): Promise<string | undefined> {
  try {
    const { data } = await supabase
      .from('person_logs')
      .select('value, note, logged_at')
      .eq('user_id', userId)
      .eq('person_id', person.id)
      .eq('kind', 'interaction')
      .order('logged_at', { ascending: false })
      .limit(200)
    const logs = ((data as Array<{ value: number | null; note: string | null; logged_at: string }> | null) ?? [])
      .filter((l) => !IMPORT_DATED.test((l.note ?? '').trim()))
    if (logs.length < 3) return undefined
    const ts = logs.map((l) => Date.parse(l.logged_at)).filter(Number.isFinite)
    const parts: string[] = []
    // Trayectoria C2: ¿el vínculo se está enfriando?
    const [traj] = forecastTrajectories([{ id: person.id, name: 'x', interactionsMs: ts, lastContactMs: person.lastContactMs ?? null }], nowMs)
    if (traj && traj.status !== 'insufficient') {
      if (traj.status === 'cooling' || traj.status === 'going_dormant') {
        parts.push(`viene ENFRIÁNDOSE (hace ${traj.silenceDays}d sin contacto vs su cadencia ~${traj.cadenceDays}d; a este ritmo, dormido en ~${traj.weeksToDormant} sem)`)
      } else if (traj.status === 'dormant') {
        parts.push('está DORMIDO (mucho silencio acumulado)')
      } else {
        parts.push('al día con su ritmo de contacto')
      }
    }
    // Salud reciente: tono medio de las últimas interacciones.
    const vals = logs.slice(0, 6).map((l) => l.value).filter((v): v is number => typeof v === 'number')
    if (vals.length >= 3) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      parts.push(`tono reciente ~${avg.toFixed(1)}/5`)
    }
    return parts.length ? `Estado del vínculo (predicción C2): ${parts.join('; ')}.` : undefined
  } catch { return undefined }
}

export async function gatherRehearseExtras(
  supabase: SupabaseClient,
  userId: string,
  person: RehearsePerson,
  nowMs: number,
): Promise<RehearseExtras> {
  const extras: RehearseExtras = {}

  // 1) Ciclo + atunamiento (M6) — SOLO romántico, marco de CUIDADO. Sin query.
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

  // 2) Pulso (C0) + temas abiertos + estado del vínculo (C2 + tono) — EN PARALELO.
  const [pulse, openThreads, bondState] = await Promise.all([
    gatherPulse(supabase, userId, person.id, nowMs),
    gatherOpenThreads(supabase, userId, person.id),
    gatherBondState(supabase, userId, person, nowMs),
  ])
  extras.pulse = pulse
  extras.openThreads = openThreads
  extras.bondState = bondState

  return extras
}
