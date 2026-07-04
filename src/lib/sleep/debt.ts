// SIR V2 — Deuda de sueño ACUMULADA (11·M1).
//
// El `sleepDebt` del motor biológico es un PROMEDIO ((7.5 − avg7) × 7), no una
// deuda real (lo marcó el propio doc 11). Este módulo modela la deuda de verdad:
// se ACUMULA con el déficit de cada noche y se AMORTIZA PARCIAL con las noches
// largas (una noche buena paga una fracción, no borra la deuda). Honesto: si no
// hay cobertura suficiente de los últimos días, lo dice en vez de afirmar.
//
// PURO y determinístico.

const DAY_MS = 86_400_000
const TARGET_HOURS = 7.5
/** Fracción del excedente de una noche larga que amortiza deuda (no se recupera
 *  1:1 durmiendo una sola noche larga). */
const RECOVERY_FRACTION = 0.5
/** Horas que una "noche de recuperación" (≈1h sobre el target) paga de deuda. */
const RECOVERY_PER_NIGHT = 1 * RECOVERY_FRACTION
const WINDOW_DAYS = 14
const RECENT_WINDOW = 7
const MIN_RECENT_COVERAGE = 5

export interface SleepDebtResult {
  /** Horas de deuda acumulada (>= 0). */
  debtHours: number
  /** Noches durmiendo ~1h sobre el target para volver a base. 0 si sin deuda. */
  nightsToBase: number
  /** Cuántos de los últimos 7 días tienen registro. */
  recentCoverage: number
  /** false → poca cobertura; la deuda es una estimación floja, no afirmar. */
  sufficient: boolean
}

function dayMs(dateKey: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey ?? '')
  if (!m) return null
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * Deuda de sueño acumulada sobre la ventana reciente. `records` = noches con
 * fecha (YYYY-MM-DD) y duración (h). `nowMs` para la cobertura reciente.
 */
export function accumulatedSleepDebt(
  records: { date: string; duration: number }[],
  nowMs: number,
  targetHours: number = TARGET_HOURS,
): SleepDebtResult {
  // Normalizar + ordenar por día asc; quedarnos con la ventana.
  const rows = records
    .map((r) => ({ ms: dayMs(r.date), duration: r.duration }))
    .filter((r): r is { ms: number; duration: number } => r.ms !== null && Number.isFinite(r.duration) && r.duration > 0)
    .sort((a, b) => a.ms - b.ms)

  const windowStart = nowMs - WINDOW_DAYS * DAY_MS
  const inWindow = rows.filter((r) => r.ms >= windowStart)

  let debt = 0
  for (const r of inWindow) {
    const deficit = targetHours - r.duration
    if (deficit > 0) debt += deficit
    else debt = Math.max(0, debt + deficit * RECOVERY_FRACTION) // deficit < 0 = excedente
    debt = Math.max(0, debt)
  }
  debt = Math.round(debt * 10) / 10

  // Cobertura reciente: días distintos con registro en los últimos 7.
  const recentStart = nowMs - RECENT_WINDOW * DAY_MS
  const recentDays = new Set(rows.filter((r) => r.ms >= recentStart).map((r) => r.ms))
  const recentCoverage = recentDays.size

  return {
    debtHours: debt,
    nightsToBase: debt > 0 ? Math.ceil(debt / RECOVERY_PER_NIGHT) : 0,
    recentCoverage,
    sufficient: recentCoverage >= MIN_RECENT_COVERAGE,
  }
}
