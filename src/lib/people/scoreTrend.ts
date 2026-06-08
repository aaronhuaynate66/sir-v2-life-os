// SIR V2 — Tendencia del score relacional (lógica pura, testeable).
//
// Dado un conjunto de snapshots diarios del score global (persistidos en
// person_score_snapshots, migración 0066), calcula la TENDENCIA: delta entre el
// snapshot más antiguo y el más reciente de la ventana, y una dirección
// (improving/declining/stable) con umbral. PURA + determinística.

export interface ScoreSnapshot {
  /** 'YYYY-MM-DD' */
  dateBucket: string
  /** Score global 0-100. */
  global: number
}

export type TrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data'

export interface ScoreTrend {
  direction: TrendDirection
  /** current - baseline. null si no hay suficientes datos. */
  delta: number | null
  /** Score más reciente (puede existir con 1 solo snapshot). */
  current: number | null
  /** Score más antiguo de la ventana comparado. null con <2 snapshots. */
  baseline: number | null
  /** Días entre baseline y current. null con <2 snapshots. */
  comparedDays: number | null
}

/** Umbral por defecto: cambios de ≤3 puntos se consideran 'stable' (ruido). */
export const DEFAULT_STABLE_THRESHOLD = 3

const DAY_MS = 86_400_000

function daysBetween(aISODate: string, bISODate: string): number {
  const a = Date.parse(`${aISODate}T00:00:00Z`)
  const b = Date.parse(`${bISODate}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round(Math.abs(b - a) / DAY_MS)
}

function isValid(s: ScoreSnapshot): boolean {
  return (
    !!s &&
    typeof s.global === 'number' &&
    Number.isFinite(s.global) &&
    typeof s.dateBucket === 'string' &&
    s.dateBucket.length >= 10
  )
}

/** Calcula la tendencia. Tolera snapshots desordenados y entradas inválidas. */
export function computeScoreTrend(
  snapshots: ScoreSnapshot[],
  stableThreshold: number = DEFAULT_STABLE_THRESHOLD,
): ScoreTrend {
  const valid = (snapshots ?? []).filter(isValid)
  if (valid.length === 0) {
    return { direction: 'insufficient_data', delta: null, current: null, baseline: null, comparedDays: null }
  }
  const sorted = [...valid].sort((a, b) => a.dateBucket.localeCompare(b.dateBucket))
  const current = sorted[sorted.length - 1]
  if (valid.length === 1) {
    return { direction: 'insufficient_data', delta: null, current: current.global, baseline: null, comparedDays: null }
  }
  const baseline = sorted[0]
  const delta = current.global - baseline.global
  const comparedDays = daysBetween(baseline.dateBucket, current.dateBucket)
  let direction: TrendDirection
  if (delta > stableThreshold) direction = 'improving'
  else if (delta < -stableThreshold) direction = 'declining'
  else direction = 'stable'
  return { direction, delta, current: current.global, baseline: baseline.global, comparedDays }
}
