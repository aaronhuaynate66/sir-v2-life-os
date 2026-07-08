// SIR V2 — Predictor forward ciclo → estado (N-de-1).
//
// El gap que dejaba `sleepModel.ts:12` ("el cruce forward con el ciclo se
// agregará cuando exista densidad"): acá está, pero SOLO para el ciclo, y sin
// inventar densidad que no hay.
//
// Idea: `correlateByCyclePhase` ya calcula, para ESTA persona, el promedio
// histórico de una métrica (tono de interacción / energía / ánimo…) por fase
// del ciclo — su baseline N-de-1. Este módulo PROYECTA ese baseline sobre los
// próximos días: computa la fase de cada día futuro (misma fórmula que el
// Horizonte) y le asigna el promedio histórico de esa fase. Resultado: "en tu
// próxima ventana lútea (en ~6 días) el tono tiende a bajar".
//
// HONESTIDAD (doc 17 · línea ética dura — CUIDAR, nunca descalificar):
//   - Es PROYECCIÓN de un promedio histórico, no un diagnóstico ni una ley.
//   - Requiere delta real entre fases (si todas las fases dan igual, no hay
//     nada que anticipar → null). No dramatizamos coincidencias.
//   - La banda de confianza baja con la irregularidad y con pocas muestras.
//   - El framing de cuidado lo pone la UI; acá solo devolvemos números.

import type { CyclePhaseId } from '@/lib/ciclo/phase'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import { phaseOnDate } from '@/lib/longitudinal/cycleTone'

const DEFAULT_HORIZON_DAYS = 28
const MAX_HORIZON_DAYS = 45
/** Piso de delta (1-5) para considerar que HAY patrón — por debajo es ruido y
 *  no proyectamos (no dramatizamos coincidencias). */
const MIN_DELTA_DIFF = 0.4

export type ForecastConfidence = 'temprana' | 'media' | 'alta'

/** Confianza honesta según cuántos registros sostienen la proyección. */
function confidenceOf(totalSamples: number): ForecastConfidence {
  if (totalSamples < 20) return 'temprana'
  if (totalSamples < 40) return 'media'
  return 'alta'
}

/** Métrica proyectable (subset de PersonLogKind con escala 1-5). */
export type ForecastMetric = PersonLogKind

/** Prioridad de auto-selección: el tono de interacción es el signal real por
 *  persona; energía/ánimo son de respaldo (suelen ser legacy en la ficha). */
export const FORECAST_METRIC_PRIORITY: ForecastMetric[] = ['interaction', 'energy', 'mood', 'sleep', 'pain']

export const METRIC_LABEL: Record<ForecastMetric, string> = {
  interaction: 'tono de las charlas',
  energy: 'energía',
  mood: 'ánimo',
  sleep: 'sueño',
  pain: 'malestar',
}

export interface ForecastDay {
  /** YYYY-MM-DD (fecha local). */
  dateKey: string
  /** Días desde hoy (0..horizon). */
  offset: number
  phaseId: CyclePhaseId
  phaseLabel: string
  /** Valor proyectado (1-5) = promedio histórico de esa fase. null si la fase
   *  no tiene muestras suficientes. */
  predicted: number | null
}

export interface ForecastWindow {
  dateKey: string
  offset: number
  phaseLabel: string
  predicted: number
}

export interface PhaseForecast {
  metric: ForecastMetric
  metricLabel: string
  /** Promedio global (entre fases con datos) — la referencia de "normal". */
  baseline: number
  /** Días proyectados (hoy .. horizon). */
  days: ForecastDay[]
  /** Próxima entrada a la fase de MENOR promedio (el "bajón" que se viene). */
  nextLow: ForecastWindow | null
  /** Próxima entrada a la fase de MAYOR promedio (la "buena ventana"). */
  nextHigh: ForecastWindow | null
  /** high - low histórico (magnitud del patrón, >0). */
  deltaDiff: number
  /** Muestras totales que sostienen la proyección. */
  totalSamples: number
  /** Confianza honesta (temprana <20 registros · media <40 · alta). */
  confidence: ForecastConfidence
}

const CYCLE_LABEL: Record<CyclePhaseId, string> = {
  menstrual: 'Menstrual',
  follicular: 'Folicular',
  ovulation: 'Ovulación',
  luteal: 'Lútea',
}

export interface CyclePhaseForecastInput {
  logs: PersonLog[]
  cycleStartDate: string | null | undefined
  cycleLengthDays: number | null | undefined
  metric: ForecastMetric
  /** Ventana a proyectar (días). Default = largo del ciclo (una vuelta). */
  horizonDays?: number
  /** Mínimo de muestras por fase para confiar en su promedio. Default 2. */
  minSamplesPerBucket?: number
}

/** Suma `offset` días a `base` respetando la fecha LOCAL (TZ-estable, sin DST
 *  en Lima). Devuelve un Date a medianoche local. */
function addLocalDays(base: Date, offset: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset)
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Proyecta UNA métrica hacia adelante contra las fases del ciclo. Devuelve null
 * si no hay ciclo, o si el historial no tiene un patrón por fase real (delta).
 */
export function buildCyclePhaseForecast(
  input: CyclePhaseForecastInput,
  now: Date = new Date(),
): PhaseForecast | null {
  const { logs, cycleStartDate, cycleLengthDays, metric } = input
  if (!cycleStartDate) return null
  const length = cycleLengthDays ?? 28
  const minPerBucket = input.minSamplesPerBucket ?? 2

  // Baseline N-de-1: promedio de la métrica por fase usando TODO el historial.
  // Clasificamos cada log con phaseOnDate, que proyecta el ciclo hacia ATRÁS por
  // módulo — a diferencia de cyclePhase, NO descarta los logs anteriores al
  // último período. Así la base es densa (mismo criterio que cycleTone / 17·M3,
  // ya en prod), no solo los pocos registros post-cycle_start.
  const acc = new Map<CyclePhaseId, { sum: number; n: number }>()
  let totalSamples = 0
  for (const log of logs) {
    if (log.kind !== metric) continue
    if (!Number.isFinite(log.value) || log.value <= 0) continue
    const phase = phaseOnDate(cycleStartDate, length, (log.loggedAt ?? '').slice(0, 10))
    if (!phase) continue
    const cur = acc.get(phase) ?? { sum: 0, n: 0 }
    cur.sum += log.value
    cur.n += 1
    acc.set(phase, cur)
    totalSamples++
  }

  // Promedio por fase (solo las que superan el umbral de muestras).
  const avgByPhase = new Map<CyclePhaseId, number>()
  for (const [phase, s] of acc) {
    if (s.n >= minPerBucket) avgByPhase.set(phase, round1(s.sum / s.n))
  }
  // Sin al menos 2 fases con datos, no hay delta que anticipar.
  if (avgByPhase.size < 2) return null

  // Delta: fase de mayor vs menor promedio. Piso anti-ruido.
  let highId: CyclePhaseId | null = null
  let lowId: CyclePhaseId | null = null
  let hi = -Infinity
  let lo = Infinity
  for (const [phase, avg] of avgByPhase) {
    if (avg > hi) { hi = avg; highId = phase }
    if (avg < lo) { lo = avg; lowId = phase }
  }
  const deltaDiff = round1(hi - lo)
  if (!highId || !lowId || deltaDiff < MIN_DELTA_DIFF) return null

  const baseline = round1(
    [...avgByPhase.values()].reduce((s, v) => s + v, 0) / avgByPhase.size,
  )

  // Serie forward: fase de cada día proyectada con la misma fórmula del Horizonte.
  const horizon = Math.min(
    MAX_HORIZON_DAYS,
    Math.max(1, input.horizonDays ?? Math.round(length) ?? DEFAULT_HORIZON_DAYS),
  )
  const days: ForecastDay[] = []
  for (let offset = 0; offset <= horizon; offset++) {
    const dayKey = ymd(addLocalDays(now, offset))
    const phase = phaseOnDate(cycleStartDate, length, dayKey)
    if (!phase) continue
    days.push({
      dateKey: dayKey,
      offset,
      phaseId: phase,
      phaseLabel: CYCLE_LABEL[phase],
      predicted: avgByPhase.get(phase) ?? null,
    })
  }

  return {
    metric,
    metricLabel: METRIC_LABEL[metric] ?? metric,
    baseline,
    days,
    nextLow: firstWindowFor(days, lowId),
    nextHigh: firstWindowFor(days, highId),
    deltaDiff,
    totalSamples,
    confidence: confidenceOf(totalSamples),
  }
}

/** Primera entrada (menor offset) a una fase dada, con valor proyectado. */
function firstWindowFor(days: ForecastDay[], phaseId: CyclePhaseId): ForecastWindow | null {
  const hit = days.find((d) => d.phaseId === phaseId && d.predicted != null)
  if (!hit) return null
  return { dateKey: hit.dateKey, offset: hit.offset, phaseLabel: hit.phaseLabel, predicted: hit.predicted! }
}

/**
 * Auto-selección: prueba las métricas en orden de prioridad y devuelve el
 * primer forecast viable (con patrón real). Así la card "just works" con la
 * métrica que la persona realmente tiene registrada.
 */
export function pickCyclePhaseForecast(
  base: Omit<CyclePhaseForecastInput, 'metric'>,
  metrics: ForecastMetric[] = FORECAST_METRIC_PRIORITY,
  now: Date = new Date(),
): PhaseForecast | null {
  for (const metric of metrics) {
    const f = buildCyclePhaseForecast({ ...base, metric }, now)
    if (f) return f
  }
  return null
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
