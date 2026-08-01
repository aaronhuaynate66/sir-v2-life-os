// SIR V2 — Motor de predicción C1: modelo idiográfico del sueño (N-de-1). PURO.
//
// "C1 = tú": no compara contra normas poblacionales, sino contra TU PROPIO
// baseline. Base científica: modelado idiográfico (N-of-1) — el patrón que
// importa es el tuyo, no el promedio de la gente. Sobre `sleep_records` (la
// única serie diaria densa que tenemos hoy) computa, de forma determinística:
// baseline personal, tendencia (+ quiebre), ritmo por día de semana, deuda de
// sueño reciente, arquitectura (profundo/REM) y una proyección de la próxima
// noche con banda honesta. Todo con estados `insufficient` — NO inventa patrones
// sobre poca data. Es descripción + proyección orientativa, NO diagnóstico médico.
//
// Nota de alcance: el N-de-1 CRUZADO (ej. sueño→FC del día siguiente) no se hace
// acá porque no hay data pareada diaria (la FC en reposo es ~mensual). Se agregará
// cuando exista densidad.

import { linreg, predict, median } from '@/lib/stats/regression'
import { detectChangePoint } from '@/lib/stats/changepoint'
import type { SleepRecord } from '@/types'

const WINDOW_DAYS = 45 // ventana de análisis (noches recientes)
const MIN_DAYS = 7 // mínimo para baseline/tendencia
const MIN_WEEKLY = 14 // mínimo para ritmo semanal (≥~2 por día de semana)
const MIN_ARCH = 5 // mínimo de noches con arquitectura (deep/rem)
const DAY = 86_400_000

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export interface SleepBaseline {
  durationH: number
  score: number
}
export interface SleepTrend {
  slopePerWeek: number
  direction: 'mejora' | 'empeora' | 'estable'
  changePoint: { dateISO: string; delta: number; direction: 'mejora' | 'empeora' } | null
}
export interface SleepWeekly {
  worstDay: string
  bestDay: string
  worstScore: number
  bestScore: number
}
export interface SleepDebt {
  nights: number
  hoursVsBaseline: number // negativo = vienes durmiendo menos que tu normal
}
export interface SleepArchitecture {
  deepPct: number
  remPct: number
  note: string
}
export interface SleepProjection {
  nextScore: number
  band: [number, number]
  confidence: 'baja' | 'media'
}
export interface SleepC1 {
  n: number
  windowDays: number
  baseline: SleepBaseline | null
  trend: SleepTrend | null
  weekly: SleepWeekly | null
  debt: SleepDebt | null
  architecture: SleepArchitecture | null
  projection: SleepProjection | null
  insufficient: string[]
}

/** Score 0-100 del registro: prefiere `score` real; si no, deriva de quality 1-10. */
function scoreOf(r: SleepRecord): number | null {
  if (typeof r.score === 'number' && Number.isFinite(r.score)) return r.score
  if (typeof r.quality === 'number' && Number.isFinite(r.quality)) return Math.round(r.quality * 10)
  return null
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

/**
 * Analiza la serie de sueño. `nowMs` = ahora (ms) para acotar la ventana y saber
 * el día de la próxima noche. Determinístico.
 */
export function analyzeSleep(records: SleepRecord[], nowMs: number): SleepC1 {
  const insufficient: string[] = []
  // 1 registro por fecha (el más completo/último), dentro de la ventana, ordenado.
  const cutoff = nowMs - WINDOW_DAYS * DAY
  const byDate = new Map<string, SleepRecord>()
  for (const r of records) {
    const t = Date.parse(r.date)
    if (!Number.isFinite(t) || t < cutoff) continue
    byDate.set(r.date, r) // si hay dup por fecha, gana el último del array
  }
  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  const n = rows.length

  const empty: SleepC1 = {
    n, windowDays: WINDOW_DAYS, baseline: null, trend: null, weekly: null,
    debt: null, architecture: null, projection: null, insufficient,
  }

  if (n < MIN_DAYS) {
    insufficient.push(`hacen falta ≥${MIN_DAYS} noches para tu baseline (tienes ${n})`)
    return empty
  }

  // Día-índice (relativo al primero) + score.
  const t0 = Date.parse(rows[0].date)
  const idx: number[] = []
  const scores: number[] = []
  const durations: number[] = []
  for (const r of rows) {
    const s = scoreOf(r)
    if (s == null) continue
    idx.push(Math.round((Date.parse(r.date) - t0) / DAY))
    scores.push(s)
    durations.push(typeof r.duration === 'number' ? r.duration : NaN)
  }

  // --- baseline (mediana personal) ---
  const medScore = median(scores)
  const medDur = median(durations.filter((d) => Number.isFinite(d)))
  const baseline: SleepBaseline | null =
    medScore != null && medDur != null ? { durationH: round1(medDur), score: Math.round(medScore) } : null
  if (!baseline) insufficient.push('sin score ni duración legibles para baseline')

  // --- tendencia + quiebre ---
  let trend: SleepTrend | null = null
  const reg = linreg(idx, scores)
  if (reg) {
    const slopePerWeek = reg.slope * 7
    const direction = slopePerWeek > 2 ? 'mejora' : slopePerWeek < -2 ? 'empeora' : 'estable'
    const cp = detectChangePoint(scores)
    let changePoint: SleepTrend['changePoint'] = null
    if (cp) {
      changePoint = {
        dateISO: rows[Math.min(cp.index, rows.length - 1)].date,
        delta: Math.round(cp.delta),
        direction: cp.delta >= 0 ? 'mejora' : 'empeora',
      }
    }
    trend = { slopePerWeek: round1(slopePerWeek), direction, changePoint }
  }

  // --- ritmo por día de semana ---
  let weekly: SleepWeekly | null = null
  if (n >= MIN_WEEKLY) {
    const sum = new Array(7).fill(0)
    const cnt = new Array(7).fill(0)
    for (const r of rows) {
      const s = scoreOf(r)
      if (s == null) continue
      const dow = new Date(Date.parse(r.date)).getUTCDay()
      sum[dow] += s
      cnt[dow] += 1
    }
    const avgs = sum.map((s, i) => (cnt[i] > 0 ? { dow: i, avg: s / cnt[i] } : null)).filter(Boolean) as { dow: number; avg: number }[]
    if (avgs.length >= 4) {
      const sorted = [...avgs].sort((a, b) => a.avg - b.avg)
      const worst = sorted[0]
      const best = sorted[sorted.length - 1]
      if (best.avg - worst.avg >= 5) {
        weekly = {
          worstDay: DIAS[worst.dow], bestDay: DIAS[best.dow],
          worstScore: Math.round(worst.avg), bestScore: Math.round(best.avg),
        }
      }
    }
  } else {
    insufficient.push(`ritmo semanal: hacen falta ≥${MIN_WEEKLY} noches (tienes ${n})`)
  }

  // --- deuda de sueño (últimas 7 noches vs baseline) ---
  let debt: SleepDebt | null = null
  if (baseline) {
    const last7 = rows.slice(-7).map((r) => r.duration).filter((d) => typeof d === 'number' && Number.isFinite(d))
    if (last7.length >= 3) {
      const hoursVsBaseline = last7.reduce((a, d) => a + (d - baseline.durationH), 0)
      debt = { nights: last7.length, hoursVsBaseline: round1(hoursVsBaseline) }
    }
  }

  // --- arquitectura (profundo/REM) ---
  let architecture: SleepArchitecture | null = null
  const archRows = rows.filter(
    (r) => typeof r.deepMin === 'number' && typeof r.remMin === 'number' && typeof r.lightMin === 'number',
  )
  if (archRows.length >= MIN_ARCH) {
    let deepP = 0, remP = 0, k = 0
    for (const r of archRows) {
      const total = (r.deepMin ?? 0) + (r.lightMin ?? 0) + (r.remMin ?? 0)
      if (total <= 0) continue
      deepP += (r.deepMin ?? 0) / total
      remP += (r.remMin ?? 0) / total
      k += 1
    }
    if (k > 0) {
      const deepPct = Math.round((deepP / k) * 100)
      const remPct = Math.round((remP / k) * 100)
      // Rangos sanos de referencia (adultos): profundo ~13-23%, REM ~20-25%.
      const parts: string[] = []
      if (deepPct < 13) parts.push('profundo por debajo del rango típico (13-23%)')
      if (remPct < 20) parts.push('REM por debajo del rango típico (20-25%)')
      const note = parts.length ? parts.join('; ') + ' — orientativo, no diagnóstico' : 'profundo y REM dentro del rango típico'
      architecture = { deepPct, remPct, note }
    }
  } else {
    insufficient.push(`arquitectura: hacen falta ≥${MIN_ARCH} noches con profundo/REM (tienes ${archRows.length})`)
  }

  // --- proyección de la próxima noche ---
  let projection: SleepProjection | null = null
  if (reg && baseline) {
    const nextIdx = Math.round((nowMs - t0) / DAY) + 1
    let point = predict(reg, nextIdx)
    // Ajuste por día de semana de la próxima noche, si hay ritmo semanal claro.
    // (se mantiene simple: solo clamp + banda por dispersión de residuos)
    point = clamp(point, 0, 100)
    const resid = scores.map((s, i) => s - predict(reg, idx[i]))
    const band = Math.max(6, Math.round(std(resid)))
    projection = {
      nextScore: Math.round(point),
      band: [clamp(Math.round(point - band), 0, 100), clamp(Math.round(point + band), 0, 100)],
      confidence: n >= MIN_WEEKLY && band <= 12 ? 'media' : 'baja',
    }
  }

  return { n, windowDays: WINDOW_DAYS, baseline, trend, weekly, debt, architecture, projection, insufficient }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}
