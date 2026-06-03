// SIR V2 — Parser PURO de payloads de "Health Auto Export" → métricas de SIR.
//
// Sin I/O, sin Date.now, sin dependencias de red ni Supabase: 100% determinístico
// y testeable (ver parse.test.ts). El route (route.ts) hace la auth, resuelve el
// usuario y persiste; este módulo sólo TRANSFORMA el payload en filas normalizadas.
//
// Decisiones de mapeo (documentadas en el resumen de la sesión):
//   - resting_heart_rate → type 'heart_rate' (la SEÑAL PRINCIPAL de FC; escalar
//     diario; Apple es la fuente de verdad y corrige el valor manual elevado,
//     porque los consumidores toman la FC más reciente por timestamp).
//   - heart_rate GENERAL → es una DISTRIBUCIÓN, no un escalar (ej. 44–143 lpm:
//     baja en reposo, sube con actividad). NUNCA se colapsa en "el último" ni
//     "el máximo". Se guarda como RANGO diario: 3 filas mín/máx/prom en tipos
//     dedicados (heart_rate_min/max/avg), claramente etiquetadas — jamás como reposo.
//   - sleeping_heart_rate → 'sleeping_heart_rate' (FC durante el sueño, aparte).
//   - lean_body_mass → 'muscle_mass_kg' (reusa la métrica corporal de la báscula).
//   - métricas acumulativas del día (pasos, energía, distancia) → SUMA intradía.
//   - métricas puntuales (peso, composición, VO2, SpO2) → ÚLTIMA lectura del día.

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

/** Cómo se resume el día de una métrica escalar:
 *   - 'sum'    : acumulativo (pasos, energía, distancia).
 *   - 'latest' : última lectura del día (peso, composición, VO2, SpO2). Default.
 *   - 'mean'   : promedio de las lecturas (FC del sueño). */
type AggMode = 'sum' | 'latest' | 'mean'

interface MetricSpec {
  type: HealthMetricType
  unit: string
  note?: string
  agg?: AggMode
}

/** Nombres de métricas de Health Auto Export que mapeamos a un ESCALAR diario.
 *  La FC general (heart_rate) NO está acá: es un rango, se maneja aparte. Los
 *  nombres no listados (height, exercise_time, etc.) se reportan en `skipped`. */
export const HEALTH_METRIC_MAP: Record<string, MetricSpec> = {
  resting_heart_rate: { type: 'heart_rate', unit: 'lpm', note: 'En reposo · Apple Health' },
  sleeping_heart_rate: { type: 'sleeping_heart_rate', unit: 'lpm', note: 'Durante el sueño · Apple Health', agg: 'mean' },
  heart_rate_sleep: { type: 'sleeping_heart_rate', unit: 'lpm', note: 'Durante el sueño · Apple Health', agg: 'mean' },
  weight_body_mass: { type: 'weight', unit: 'kg' },
  body_fat_percentage: { type: 'body_fat_percent', unit: '%' },
  lean_body_mass: { type: 'muscle_mass_kg', unit: 'kg', note: 'Masa magra · Apple Health' },
  body_mass_index: { type: 'bmi', unit: '' },
  step_count: { type: 'steps', unit: 'pasos', agg: 'sum' },
  active_energy: { type: 'active_energy', unit: 'kcal', agg: 'sum' },
  basal_energy_burned: { type: 'resting_energy', unit: 'kcal', agg: 'sum' },
  walking_running_distance: { type: 'distance_km', unit: 'km', agg: 'sum' },
  vo2_max: { type: 'vo2_max', unit: 'ml/kg·min' },
  blood_oxygen_saturation: { type: 'blood_oxygen', unit: '%' },
}

const SLEEP_METRIC_NAME = 'sleep_analysis'
/** FC general: distribución intradía. Se mapea a rango (mín/máx/prom), no escalar. */
const HEART_RATE_NAME = 'heart_rate'

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
  /** Acumulador: suma (sum/mean) o último valor (latest). */
  value: number
  /** Conteo de lecturas (sólo para 'mean'). */
  count: number
  /** ISO del data point más reciente del día. */
  measuredAt: string
  /** Orden del último visto (comparación lexicográfica ISO). */
  latestIso: string
}

function mapScalarMetric(metric: HAEMetric, spec: MetricSpec, haeName: string): NormalizedHealthMetric[] {
  const agg: AggMode = spec.agg ?? 'latest'
  const byDay = new Map<string, DayAgg>()

  for (const dp of metric.data ?? []) {
    const parsed = parseHAEDate(dp.date)
    const v = extractQty(dp)
    if (!parsed || v === null) continue

    const cur = byDay.get(parsed.day)
    if (!cur) {
      byDay.set(parsed.day, { value: v, count: 1, measuredAt: parsed.iso, latestIso: parsed.iso })
      continue
    }
    if (agg === 'sum' || agg === 'mean') {
      cur.value += v
      cur.count += 1
      if (parsed.iso > cur.latestIso) {
        cur.measuredAt = parsed.iso
        cur.latestIso = parsed.iso
      }
    } else if (parsed.iso >= cur.latestIso) {
      // 'latest': última lectura del día gana.
      cur.value = v
      cur.count = 1
      cur.measuredAt = parsed.iso
      cur.latestIso = parsed.iso
    }
  }

  const out: NormalizedHealthMetric[] = []
  for (const [day, d] of byDay) {
    const value = agg === 'mean' ? d.value / d.count : d.value
    out.push({
      type: spec.type,
      value: round2(value),
      unit: spec.unit,
      measuredAt: d.measuredAt,
      day,
      externalId: `ah:${haeName}:${day}`,
      note: spec.note,
    })
  }
  return out
}

// ─── Mapeo de FC general (rango diario: mín/máx/prom) ─────────────────

interface HRDayAgg {
  min: number
  max: number
  avgSum: number
  avgCount: number
  latestIso: string
}

const HR_RANGE_NOTE = 'Rango diario · Apple Health'

/**
 * Mapea la métrica `heart_rate` general a TRES filas por día: mín, máx y
 * promedio. La FC general es una distribución (varía con la actividad), así que
 * colapsarla en un solo número sería engañoso. Cada data point de HAE puede ser
 * un sample crudo (qty) o venir ya agregado (Min/Max/Avg) — soportamos ambos.
 */
function mapHeartRateRange(metric: HAEMetric): NormalizedHealthMetric[] {
  const byDay = new Map<string, HRDayAgg>()

  for (const dp of metric.data ?? []) {
    const parsed = parseHAEDate(dp.date)
    if (!parsed) continue
    const fallback = extractQty(dp) // qty/value/Avg para samples crudos
    const mn = num(dp.Min) ?? fallback
    const mx = num(dp.Max) ?? fallback
    const av = num(dp.Avg) ?? fallback
    if (mn === null && mx === null && av === null) continue

    const cur =
      byDay.get(parsed.day) ?? { min: Infinity, max: -Infinity, avgSum: 0, avgCount: 0, latestIso: '' }
    if (mn !== null) cur.min = Math.min(cur.min, mn)
    if (mx !== null) cur.max = Math.max(cur.max, mx)
    if (av !== null) {
      cur.avgSum += av
      cur.avgCount += 1
    }
    if (parsed.iso > cur.latestIso) cur.latestIso = parsed.iso
    byDay.set(parsed.day, cur)
  }

  const out: NormalizedHealthMetric[] = []
  for (const [day, d] of byDay) {
    const base = { unit: 'lpm', measuredAt: d.latestIso, day, note: HR_RANGE_NOTE }
    if (Number.isFinite(d.min)) {
      out.push({ ...base, type: 'heart_rate_min', value: round2(d.min), externalId: `ah:heart_rate_min:${day}` })
    }
    if (Number.isFinite(d.max)) {
      out.push({ ...base, type: 'heart_rate_max', value: round2(d.max), externalId: `ah:heart_rate_max:${day}` })
    }
    if (d.avgCount > 0) {
      out.push({ ...base, type: 'heart_rate_avg', value: round2(d.avgSum / d.avgCount), externalId: `ah:heart_rate_avg:${day}` })
    }
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
    if (name === HEART_RATE_NAME) {
      // FC general → rango diario (mín/máx/prom), nunca un escalar engañoso.
      healthMetrics.push(...mapHeartRateRange(metric))
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
