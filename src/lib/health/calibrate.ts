// SIR V2 — Auto-calibración de umbrales de salud (mejora del monitoreo #789).
//
// vitalsAnomaly usaba umbrales FIJOS (el rango Zepp de Aaron). Esto los hace
// PERSONALES y adaptativos: calcula qué es "normal para vos" desde tu propia
// historia (percentiles de las últimas N muestras) y flaggea solo los desvíos
// reales para tu cuerpo. Con poca data cae a los umbrales por defecto. PURA.
//
// Robusto a outliers: usa percentiles (no media/desvío), así unos pocos días
// malos —los enfermos incluidos— no inflan lo que se considera normal.

import type { VitalsRanges } from './vitalsAnomaly'
import { DEFAULT_RANGES } from './vitalsAnomaly'

/** Series históricas por métrica (valores diarios; el orden no importa). */
export interface VitalsHistory {
  hrvAvg: number[]
  sleepingHr: number[]
  respRate: number[]
  highHrAlerts: number[]
}

export interface CalibrateOpts {
  /** Mínimo de muestras para calibrar una métrica (si no, usa el default). Default 10. */
  minSamples?: number
  /** Percentil para el umbral BAJO (VFC). Default 10 (decil inferior). */
  lowPct?: number
  /** Percentil para los umbrales ALTOS (FC/resp/alertas). Default 90. */
  highPct?: number
}

export interface CalibrateResult {
  ranges: VitalsRanges
  /** Qué métricas se calibraron con data propia (vs default). Para debug/telemetría. */
  calibrated: Record<keyof VitalsRanges, boolean>
}

/** Percentil (0-100) con interpolación lineal. null si no hay datos. */
export function percentile(nums: number[], p: number): number | null {
  const xs = (nums ?? []).filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b)
  if (xs.length === 0) return null
  if (xs.length === 1) return xs[0]
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (xs.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return xs[lo]
  return xs[lo] + (xs[hi] - xs[lo]) * (rank - lo)
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Deriva umbrales personales desde la historia. Cada métrica se calibra solo si
 * tiene ≥ minSamples; si no, conserva el default. `highHrAlertsMax` nunca baja
 * del default (su distribución está muy cargada en 0 → el percentil sería 0 y
 * dispararía con cualquier alerta suelta).
 */
export function calibrateRanges(
  history: VitalsHistory,
  defaults: VitalsRanges = DEFAULT_RANGES,
  opts: CalibrateOpts = {},
): CalibrateResult {
  const minSamples = opts.minSamples ?? 10
  const lowPct = opts.lowPct ?? 10
  const highPct = opts.highPct ?? 90

  const enough = (arr: number[]) => (arr?.filter((n) => Number.isFinite(n)).length ?? 0) >= minSamples
  const calibrated: Record<keyof VitalsRanges, boolean> = {
    hrvAvgMin: false, sleepingHrMax: false, respRateMax: false, highHrAlertsMax: false,
  }
  const ranges: VitalsRanges = { ...defaults }

  if (enough(history.hrvAvg)) {
    ranges.hrvAvgMin = round1(percentile(history.hrvAvg, lowPct)!)
    calibrated.hrvAvgMin = true
  }
  if (enough(history.sleepingHr)) {
    ranges.sleepingHrMax = round1(percentile(history.sleepingHr, highPct)!)
    calibrated.sleepingHrMax = true
  }
  if (enough(history.respRate)) {
    ranges.respRateMax = round1(percentile(history.respRate, highPct)!)
    calibrated.respRateMax = true
  }
  if (enough(history.highHrAlerts)) {
    // Piso en el default: no volverse MÁS sensible que ~3 alertas/día.
    ranges.highHrAlertsMax = Math.max(defaults.highHrAlertsMax, round1(percentile(history.highHrAlerts, highPct)!))
    calibrated.highHrAlertsMax = true
  }

  return { ranges, calibrated }
}
