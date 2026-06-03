// SIR V2 — Parser PURO de payloads de "Health Auto Export" → métricas de SIR.
//
// Sin I/O, sin Date.now, sin dependencias de red ni Supabase: 100% determinístico
// y testeable (ver parse.test.ts). El route (route.ts) hace la auth, resuelve el
// usuario y persiste; este módulo sólo TRANSFORMA el payload en filas normalizadas.
//
// Decisiones de mapeo (documentadas en el resumen de la sesión):
//   - resting_heart_rate → type 'heart_rate' (la señal de FC existente; Apple es
//     la fuente de verdad y corrige el valor manual elevado, porque los consumidores
//     toman la FC MÁS RECIENTE por timestamp).
//   - heart_rate instantánea (actual) → SE OMITE: contaminaría la serie de FC en
//     reposo (gana la de timestamp más nuevo). Queda como dato no mapeado.
//   - lean_body_mass → 'muscle_mass_kg' (reusa la métrica corporal de la báscula).
//   - métricas acumulativas del día (pasos, energía, distancia) → SUMA intradía.
//   - métricas puntuales (peso, composición, FC, VO2, SpO2) → ÚLTIMA lectura del día.

import type { HealthMetricType } from '@/types'
import type {
  HAEDataPoint,
  HAEMetric,
  HealthAutoExportPayload,
  IngestMapResult,
  NormalizedHealthMetric,
  NormalizedSleepRecord,
} from './types'

// ─── Mapeo nombre-de-Apple → tipo/unidad de SIR ───────────────────────

interface MetricSpec {
  type: HealthMetricType
  unit: string
  note?: string
  /** true = el valor del día es la SUMA de los data points (acumulativo). */
  cumulative?: boolean
}

/** Nombres de métricas de Health Auto Export que mapeamos. Los no listados
 *  (heart_rate instantánea, height, exercise_time, etc.) se reportan en `skipped`. */
export const HEALTH_METRIC_MAP: Record<string, MetricSpec> = {
  resting_heart_rate: { type: 'heart_rate', unit: 'lpm', note: 'En reposo · Apple Health' },
  weight_body_mass: { type: 'weight', unit: 'kg' },
  body_fat_percentage: { type: 'body_fat_percent', unit: '%' },
  lean_body_mass: { type: 'muscle_mass_kg', unit: 'kg', note: 'Masa magra · Apple Health' },
  body_mass_index: { type: 'bmi', unit: '' },
  step_count: { type: 'steps', unit: 'pasos', cumulative: true },
  active_energy: { type: 'active_energy', unit: 'kcal', cumulative: true },
  basal_energy_burned: { type: 'resting_energy', unit: 'kcal', cumulative: true },
  walking_running_distance: { type: 'distance_km', unit: 'km', cumulative: true },
  vo2_max: { type: 'vo2_max', unit: 'ml/kg·min' },
  blood_oxygen_saturation: { type: 'blood_oxygen', unit: '%' },
}

const SLEEP_METRIC_NAME = 'sleep_analysis'

/** Nombres posibles de la "puntuación de sueño" (0-100). Apple (iOS 26) y apps
 *  como AutoSleep la exponen con distintos nombres; aceptamos varios. */
const SLEEP_SCORE_NAMES = new Set([
  'sleep_score',
  'apple_sleep_score',
  'sleeping_score',
])

// ─── Parseo de fechas (Apple manda "YYYY-MM-DD HH:mm:ss ±HHMM" local) ──

const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/
const DATEONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface ParsedDate {
  /** ISO 8601 válido con offset (o Z). */
  iso: string
  /** 'YYYY-MM-DD' en el offset LOCAL embebido (sin shift UTC). */
  day: string
  /** "HH:mm" local. */
  hm: string
}

/**
 * Parser tolerante de la fecha de Health Auto Export. Preserva el offset local
 * (Lima es -05:00) para que `day` no se corra de día por UTC. Devuelve null si
 * no es parseable.
 */
export function parseHAEDate(raw: unknown): ParsedDate | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null

  const m = DATETIME_RE.exec(s)
  if (m) {
    const [, y, mo, d, hh, mm, ss, offRaw] = m
    let off = offRaw ?? ''
    if (off && off !== 'Z' && !off.includes(':')) {
      // "-0500" → "-05:00"
      off = `${off.slice(0, 3)}:${off.slice(3)}`
    }
    const sec = ss ?? '00'
    const iso = `${y}-${mo}-${d}T${hh}:${mm}:${sec}${off || 'Z'}`
    return { iso, day: `${y}-${mo}-${d}`, hm: `${hh}:${mm}` }
  }

  const d0 = DATEONLY_RE.exec(s)
  if (d0) {
    const [, y, mo, d] = d0
    return { iso: `${y}-${mo}-${d}T00:00:00Z`, day: `${y}-${mo}-${d}`, hm: '00:00' }
  }

  return null
}

// ─── Extracción de valores escalares ──────────────────────────────────

/** Coacciona un campo a número finito o null. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Valor escalar de un data point: qty → value → Avg → avg. */
export function extractQty(dp: HAEDataPoint): number | null {
  return (
    num(dp.qty) ??
    num(dp.value) ??
    num(dp.Avg) ??
    num((dp as Record<string, unknown>).avg)
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

// ─── Mapeo de métricas escalares ──────────────────────────────────────

interface DayAgg {
  /** Suma (acumulativo) o último valor (puntual). */
  value: number
  /** ISO del data point más reciente del día. */
  measuredAt: string
  /** Para "puntual": orden del último visto (comparación lexicográfica ISO). */
  latestIso: string
}

function mapScalarMetric(metric: HAEMetric, spec: MetricSpec, haeName: string): NormalizedHealthMetric[] {
  const byDay = new Map<string, DayAgg>()

  for (const dp of metric.data ?? []) {
    const parsed = parseHAEDate(dp.date)
    const v = extractQty(dp)
    if (!parsed || v === null) continue

    const cur = byDay.get(parsed.day)
    if (!cur) {
      byDay.set(parsed.day, { value: v, measuredAt: parsed.iso, latestIso: parsed.iso })
      continue
    }
    if (spec.cumulative) {
      cur.value += v
      if (parsed.iso > cur.latestIso) {
        cur.measuredAt = parsed.iso
        cur.latestIso = parsed.iso
      }
    } else if (parsed.iso >= cur.latestIso) {
      // puntual: última lectura del día gana.
      cur.value = v
      cur.measuredAt = parsed.iso
      cur.latestIso = parsed.iso
    }
  }

  const out: NormalizedHealthMetric[] = []
  for (const [day, agg] of byDay) {
    out.push({
      type: spec.type,
      value: round2(agg.value),
      unit: spec.unit,
      measuredAt: agg.measuredAt,
      day,
      externalId: `ah:${haeName}:${day}`,
      note: spec.note,
    })
  }
  return out
}

// ─── Mapeo de sueño ───────────────────────────────────────────────────

/** Horas dormidas de un data point: totalSleep → asleep → suma de etapas. */
function sleepHours(dp: HAEDataPoint): number | null {
  const total = num(dp.totalSleep) ?? num(dp.asleep)
  if (total !== null) return total
  const stages = [dp.deep, dp.core, dp.rem].map(num).filter((x): x is number => x !== null)
  if (stages.length > 0) return stages.reduce((s, x) => s + x, 0)
  return null
}

interface SleepAgg {
  duration: number
  start?: { iso: string; hm: string }
  end?: { iso: string; hm: string }
}

/** Deriva calidad 1-10 a partir de las horas dormidas (cuando no hay score). */
export function qualityFromDuration(hours: number): number {
  if (hours >= 7.5) return 8
  if (hours >= 6.5) return 7
  if (hours >= 5.5) return 6
  if (hours >= 4.5) return 5
  if (hours >= 3) return 4
  return 3
}

/** Convierte una puntuación de sueño 0-100 a calidad 1-10. */
export function qualityFromScore(score: number): number {
  return clamp(Math.round(score / 10), 1, 10)
}

function mapSleep(
  sleepMetric: HAEMetric | undefined,
  scoreByDay: Map<string, number>,
): NormalizedSleepRecord[] {
  if (!sleepMetric) return []
  const byNight = new Map<string, SleepAgg>()

  for (const dp of sleepMetric.data ?? []) {
    const hours = sleepHours(dp)
    if (hours === null || hours <= 0) continue

    // La "fecha" de la noche = día del despertar (sleepEnd) → fallback date.
    const endP = parseHAEDate(dp.sleepEnd) ?? parseHAEDate(dp.date)
    const startP = parseHAEDate(dp.sleepStart) ?? parseHAEDate(dp.inBedStart)
    if (!endP) continue

    const night = endP.day
    const cur = byNight.get(night) ?? { duration: 0 }
    cur.duration += hours
    if (startP && (!cur.start || startP.iso < cur.start.iso)) {
      cur.start = { iso: startP.iso, hm: startP.hm }
    }
    if (!cur.end || endP.iso > cur.end.iso) {
      cur.end = { iso: endP.iso, hm: endP.hm }
    }
    byNight.set(night, cur)
  }

  const out: NormalizedSleepRecord[] = []
  for (const [date, agg] of byNight) {
    const duration = round2(clamp(agg.duration, 0, 24))
    const score = scoreByDay.get(date)
    const quality =
      score !== undefined ? qualityFromScore(score) : qualityFromDuration(duration)
    out.push({
      date,
      bedtime: agg.start?.hm ?? '00:00',
      wakeTime: agg.end?.hm ?? '00:00',
      duration,
      quality,
      externalId: `ah:sleep:${date}`,
      notes:
        score !== undefined
          ? `Apple Health · score ${Math.round(score)}/100`
          : 'Apple Health',
    })
  }
  return out
}

// ─── Entry point ──────────────────────────────────────────────────────

/** Extrae el array de métricas, sin importar si vino en `data.metrics` o en raíz. */
function getMetrics(payload: HealthAutoExportPayload): HAEMetric[] {
  const fromData = payload?.data?.metrics
  if (Array.isArray(fromData)) return fromData
  if (Array.isArray(payload?.metrics)) return payload.metrics
  return []
}

/** Normaliza el nombre de una métrica (case-insensitive, sin espacios). */
function normName(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

/**
 * Mapea un payload completo de Health Auto Export a filas normalizadas de SIR.
 * PURO. Tolera payloads parciales, nombres desconocidos y data points basura.
 */
export function mapHealthAutoExport(payload: HealthAutoExportPayload): IngestMapResult {
  const metrics = getMetrics(payload)
  const healthMetrics: NormalizedHealthMetric[] = []
  const skipped = new Set<string>()

  // 1. Recolectar scores de sueño por día (si vienen como métrica aparte).
  const scoreByDay = new Map<string, number>()
  for (const metric of metrics) {
    if (!SLEEP_SCORE_NAMES.has(normName(metric.name))) continue
    for (const dp of metric.data ?? []) {
      const parsed = parseHAEDate(dp.date)
      const v = extractQty(dp)
      if (parsed && v !== null) scoreByDay.set(parsed.day, v)
    }
  }

  // 2. Métricas escalares + sueño.
  let sleepMetric: HAEMetric | undefined
  for (const metric of metrics) {
    const name = normName(metric.name)
    if (!name) continue
    if (name === SLEEP_METRIC_NAME) {
      sleepMetric = metric
      continue
    }
    if (SLEEP_SCORE_NAMES.has(name)) continue // ya consumido arriba
    const spec = HEALTH_METRIC_MAP[name]
    if (!spec) {
      skipped.add(name)
      continue
    }
    healthMetrics.push(...mapScalarMetric(metric, spec, name))
  }

  const sleepRecords = mapSleep(sleepMetric, scoreByDay)

  return {
    healthMetrics,
    sleepRecords,
    skipped: [...skipped].sort(),
  }
}
