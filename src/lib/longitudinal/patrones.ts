// SIR V2 — Patrones cruzados adicionales (Fase 3c ampliada).
//
// Además de correlateByExplicitCyclePhase (logs × ciclo de la persona), acá
// tenemos:
//   - groupMomentsByExplicitCycle: cuenta moments (peleas, encuentros, etc.)
//     agrupados por fase del ciclo REGISTRADA de la persona ese día.
//   - correlateMomentsByLunar: distribuye moments por fase lunar (patrón
//     independiente del ciclo).
// Ambas funciones PURAS, determinísticas, testeables.

import type { RelationshipMoment } from '@/lib/moments/types'
import type { PersonCycleEntry, CyclePhase } from '@/lib/person-cycles/types'
import { moonPhaseId, type LunarPhaseId } from '@/lib/lunar/phase'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

export interface PhaseBucketCount {
  phaseId: string
  label: string
  count: number
  /** Fraction del total (0..1). */
  fraction: number
}

const EXPLICIT_CYCLE_ORDER: Array<{ id: CyclePhase; label: string }> = [
  { id: 'bleeding', label: 'Sangrado' },
  { id: 'pms', label: 'PMS' },
  { id: 'mid_cycle', label: 'Medio del ciclo' },
  { id: 'ovulation', label: 'Ovulación' },
  { id: 'luteal', label: 'Lútea' },
  { id: 'unknown', label: 'Indefinida' },
]

const LUNAR_ORDER: Array<{ id: LunarPhaseId; label: string }> = [
  { id: 'new', label: 'Luna nueva' },
  { id: 'waxing_crescent', label: 'Creciente' },
  { id: 'first_quarter', label: 'Cuarto creciente' },
  { id: 'waxing_gibbous', label: 'Gibosa creciente' },
  { id: 'full', label: 'Luna llena' },
  { id: 'waning_gibbous', label: 'Gibosa menguante' },
  { id: 'last_quarter', label: 'Cuarto menguante' },
  { id: 'waning_crescent', label: 'Menguante' },
]

/** Agrupa moments por fase del ciclo registrada en el día que ocurrió. Solo
 *  cuenta moments cuyo occurred_on cae en un día con entry. */
export function groupMomentsByExplicitCycle(
  moments: RelationshipMoment[],
  cycles: PersonCycleEntry[],
): { buckets: PhaseBucketCount[]; total: number } {
  if (!moments.length || !cycles.length) {
    return { buckets: EXPLICIT_CYCLE_ORDER.map((p) => ({ phaseId: p.id, label: p.label, count: 0, fraction: 0 })), total: 0 }
  }
  const byDay = new Map<string, CyclePhase>()
  for (const c of cycles) byDay.set(c.date, c.phase)
  const counts = new Map<string, number>()
  let total = 0
  for (const m of moments) {
    const ymd = m.occurredOn.slice(0, 10)
    const phase = byDay.get(ymd)
    if (!phase) continue
    counts.set(phase, (counts.get(phase) ?? 0) + 1)
    total++
  }
  const buckets = EXPLICIT_CYCLE_ORDER.map((p) => ({
    phaseId: p.id, label: p.label,
    count: counts.get(p.id) ?? 0,
    fraction: total > 0 ? (counts.get(p.id) ?? 0) / total : 0,
  }))
  return { buckets, total }
}

/** Distribuye moments por fase lunar del día de ocurrencia. */
export function groupMomentsByLunar(
  moments: RelationshipMoment[],
): { buckets: PhaseBucketCount[]; total: number } {
  const counts = new Map<string, number>()
  let total = 0
  for (const m of moments) {
    const d = parseLocalDate(m.occurredOn)
    if (!d) continue
    const phaseId = moonPhaseId(d)
    counts.set(phaseId, (counts.get(phaseId) ?? 0) + 1)
    total++
  }
  const buckets = LUNAR_ORDER.map((p) => ({
    phaseId: p.id, label: p.label,
    count: counts.get(p.id) ?? 0,
    fraction: total > 0 ? (counts.get(p.id) ?? 0) / total : 0,
  }))
  return { buckets, total }
}

/** Bucket con más moments (nulo si empate con 0). */
export function topBucket(result: { buckets: PhaseBucketCount[]; total: number }): PhaseBucketCount | null {
  if (result.total === 0) return null
  const withData = result.buckets.filter((b) => b.count > 0)
  if (withData.length === 0) return null
  return withData.reduce((a, b) => b.count > a.count ? b : a)
}
