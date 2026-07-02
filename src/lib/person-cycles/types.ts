// SIR V2 — Tipos compartidos de person_cycles (mig 0110).
//
// Registro DÍA A DÍA del ciclo de una persona (típicamente la pareja) —
// más granular que el cycleStartDate+length de `people` que asume ciclo
// regular. Fuente de verdad para cruzar con person_logs en la vista de
// correlación longitudinal.

export type CyclePhase = 'bleeding' | 'pms' | 'mid_cycle' | 'ovulation' | 'luteal' | 'unknown'
export type CycleConfidence = 'high' | 'medium' | 'low'
export type CycleSource = 'aaron' | 'self_report'

export interface PersonCycleEntry {
  id: string
  personId: string
  /** YYYY-MM-DD (day of event). */
  date: string
  phase: CyclePhase
  confidence: CycleConfidence
  source: CycleSource
  note: string | null
  createdAt: string
}

interface RawRow {
  id: string
  person_id: string
  date: string
  phase: string
  confidence: string
  source: string
  note: string | null
  created_at: string
}

export function mapPersonCycleRow(r: RawRow): PersonCycleEntry {
  return {
    id: r.id,
    personId: r.person_id,
    date: (r.date || '').slice(0, 10),
    phase: (['bleeding', 'pms', 'mid_cycle', 'ovulation', 'luteal', 'unknown'] as const).includes(r.phase as CyclePhase) ? (r.phase as CyclePhase) : 'unknown',
    confidence: (['high', 'medium', 'low'] as const).includes(r.confidence as CycleConfidence) ? (r.confidence as CycleConfidence) : 'medium',
    source: (['aaron', 'self_report'] as const).includes(r.source as CycleSource) ? (r.source as CycleSource) : 'aaron',
    note: r.note,
    createdAt: r.created_at,
  }
}
