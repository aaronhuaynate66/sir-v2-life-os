// SIR V2 — Tono de las interacciones por fase del ciclo (17·M3).
//
// Extiende la trazabilidad del ciclo más allá de los `moments`: cruza el TONO de
// las interacciones (person_logs kind='interaction', value 1-5) con la fase del
// ciclo del DÍA de cada una → "el tono tiende a ser más bajo en [fase]". Para
// entender con EMPATÍA (contexto), con el n a la vista — nunca un veredicto ni
// una descalificación (ver `docs/17`, línea ética).
//
// PURO. Computa la fase de CUALQUIER fecha (incluidas históricas) proyectando el
// ciclo hacia atrás/adelante por módulo — best-effort asumiendo largo estable.

import type { CyclePhaseId } from '@/lib/ciclo/phase'

const DAY_MS = 86_400_000
const MENSTRUAL_DAYS = 5
/** Mínimo de interacciones en una fase para tenerla en cuenta como "más baja". */
const MIN_FOR_LOWEST = 3

const PHASE_LABEL: Record<CyclePhaseId, string> = {
  menstrual: 'Menstrual', follicular: 'Folicular', ovulation: 'Ovulación', luteal: 'Lútea',
}
const ORDER: readonly CyclePhaseId[] = ['menstrual', 'follicular', 'ovulation', 'luteal']

export interface ToneByPhaseBucket {
  phaseId: CyclePhaseId
  label: string
  /** Tono promedio (1-5) o null si no hay interacciones en la fase. */
  avgTone: number | null
  count: number
}
export interface ToneByPhaseResult {
  buckets: ToneByPhaseBucket[]
  total: number
  /** Fase con el tono promedio más bajo (solo si tiene muestra suficiente). null si no. */
  lowest: ToneByPhaseBucket | null
}

function keyToMs(k: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(k ?? '')
  if (!m) return null
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isFinite(t) ? t : null
}

function classify(cycleDay: number, length: number): CyclePhaseId {
  if (cycleDay <= MENSTRUAL_DAYS) return 'menstrual'
  const ovuMid = length - 14
  if (cycleDay >= ovuMid - 1 && cycleDay <= ovuMid + 1) return 'ovulation'
  if (cycleDay < ovuMid - 1) return 'follicular'
  return 'luteal'
}

/** Fase del ciclo en `dayKey`, proyectando desde `startKey` (soporta fechas
 *  ANTERIORES al inicio → módulo positivo). null si no parsea. */
export function phaseOnDate(startKey: string, lengthDays: number, dayKey: string): CyclePhaseId | null {
  const s = keyToMs(startKey)
  const d = keyToMs(dayKey)
  if (s == null || d == null) return null
  const len = Math.max(15, Math.min(60, Math.round(lengthDays || 28)))
  const daysSince = Math.round((d - s) / DAY_MS)
  const cycleDay = (((daysSince % len) + len) % len) + 1
  return classify(cycleDay, len)
}

/**
 * Cruza el tono de las interacciones por fase del ciclo. `logs` = interacciones
 * con fecha (YYYY-MM-DD o ISO) y tono (1-5). Sin cycleStartDate → todo vacío.
 */
export function groupLogToneByPhase(
  logs: { date: string; tone: number }[],
  cycleStartDate: string | null | undefined,
  cycleLengthDays: number | null | undefined,
): ToneByPhaseResult {
  const acc = new Map<CyclePhaseId, { sum: number; n: number }>()
  let total = 0
  if (cycleStartDate) {
    for (const l of logs) {
      if (!Number.isFinite(l.tone)) continue
      const dayKey = (l.date ?? '').slice(0, 10)
      const phase = phaseOnDate(cycleStartDate, cycleLengthDays ?? 28, dayKey)
      if (!phase) continue
      const cur = acc.get(phase) ?? { sum: 0, n: 0 }
      cur.sum += l.tone; cur.n += 1
      acc.set(phase, cur)
      total++
    }
  }
  const buckets: ToneByPhaseBucket[] = ORDER.map((p) => {
    const s = acc.get(p)
    return { phaseId: p, label: PHASE_LABEL[p], avgTone: s && s.n > 0 ? Math.round((s.sum / s.n) * 10) / 10 : null, count: s?.n ?? 0 }
  })
  const eligible = buckets.filter((b) => b.count >= MIN_FOR_LOWEST && b.avgTone != null)
  const lowest = eligible.length >= 2 ? eligible.reduce((lo, b) => (b.avgTone! < lo.avgTone! ? b : lo)) : null
  return { buckets, total, lowest }
}
