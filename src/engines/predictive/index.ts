// SIR V2 — Motor predictivo general (A5). PURO.
//
// docs/01: "SIR V2 no es reactivo. Es anticipatorio." Hoy la anticipación es
// puntual (ciclos, cumpleaños, fin de mes #498). Esto generaliza: proyecta la
// trayectoria futura de CUALQUIER serie diaria (paz, energía, ánimo, sueño, FC)
// por regresión lineal (OLS), con confianza y un gate honesto: con pocos puntos
// o serie plana en el tiempo devuelve 'insufficient' en vez de inventar.
//
// Complementa lib/forecast/monthEnd (finanzas, run-rate) con un proyector de
// tendencia genérico reutilizable.

import type { DayPoint } from '@/lib/patterns/observe'

export type ForecastDirection = 'rising' | 'falling' | 'flat' | 'insufficient'

export interface Projection {
  direction: ForecastDirection
  /** Valor proyectado a `horizonDays`. null si insufficient. */
  projected: number | null
  /** Pendiente por día. null si insufficient. */
  slopePerDay: number | null
  /** Confianza por nº de puntos + ajuste (R²). null si insufficient. */
  confidence: 'low' | 'medium' | 'high' | null
  /** Días de datos usados. */
  n: number
}

export interface ProjectOpts {
  /** Horizonte de proyección (días). Default 7. */
  horizonDays?: number
  /** Cambio total en el horizonte por debajo del cual es 'flat'. Default 0.5. */
  flatThreshold?: number
  /** Puntos mínimos para proyectar. Default 4. */
  minPoints?: number
}

const DAY_MS = 86_400_000

function dayIndex(iso: string, baseMs: number): number {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round((t - baseMs) / DAY_MS) : NaN
}

/**
 * Proyecta la serie `horizonDays` hacia adelante por OLS. PURO.
 * Insufficient si hay <minPoints puntos válidos o todos caen el mismo día.
 */
export function projectSeries(points: DayPoint[], opts: ProjectOpts = {}): Projection {
  const horizon = opts.horizonDays ?? 7
  const flat = opts.flatThreshold ?? 0.5
  const minPoints = opts.minPoints ?? 4

  const clean = points
    .filter((p) => p && typeof p.value === 'number' && Number.isFinite(p.value) && typeof p.date === 'string')
    .map((p) => ({ date: p.date, value: p.value }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const n = clean.length
  if (n < minPoints) return { direction: 'insufficient', projected: null, slopePerDay: null, confidence: null, n }

  const baseMs = Date.parse(`${clean[0].date.slice(0, 10)}T00:00:00Z`)
  const xs = clean.map((p) => dayIndex(p.date, baseMs))
  const ys = clean.map((p) => p.value)
  if (xs.some((x) => !Number.isFinite(x))) return { direction: 'insufficient', projected: null, slopePerDay: null, confidence: null, n }

  const meanX = xs.reduce((s, v) => s + v, 0) / n
  const meanY = ys.reduce((s, v) => s + v, 0) / n
  let sxx = 0, sxy = 0, syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx === 0) return { direction: 'insufficient', projected: null, slopePerDay: null, confidence: null, n }

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const lastX = xs[n - 1]
  const projected = Math.round((intercept + slope * (lastX + horizon)) * 100) / 100
  const r2 = syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)))

  const change = slope * horizon
  const direction: ForecastDirection = Math.abs(change) < flat ? 'flat' : change > 0 ? 'rising' : 'falling'
  const confidence: Projection['confidence'] = n >= 14 && r2 >= 0.3 ? 'high' : n >= 7 ? 'medium' : 'low'

  return { direction, projected, slopePerDay: Math.round(slope * 1000) / 1000, confidence, n }
}
