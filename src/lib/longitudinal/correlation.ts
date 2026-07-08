// SIR V2 — Correlación longitudinal (Fase 3c, parte determinística).
//
// Cruza person_logs (mood / energy / sleep / pain, escala 1-5) contra:
//   - moonPhase()  → 8 fases lunares (global, depende sólo de la fecha).
//   - cyclePhase() → 4 fases del ciclo (depende del cycleStartDate de la
//                    persona).
//
// y devuelve promedios por fase + el delta notable (fase con promedio más
// alto vs más bajo). 100% determinístico: cero LLM, cero red. La capa
// narrativa opcional (Anthropic) vive aparte, detrás de un botón.
//
// INVARIANTES (backlog #1 y #5):
//   - Bienestar, sin dramatizar: reportamos promedios, no diagnósticos.
//   - Correlación ≠ causa: NO afirmamos causalidad. Si no hay data
//     suficiente, devolvemos buckets vacíos / delta null → la UI muestra
//     un empty state honesto en vez de inventar un patrón.
//
// Determinismo TZ:
//   - Ciclo: clasificamos por la FECHA (date-only) del log vía
//     parseLocalDate → comparación de medianoches locales, estable.
//   - Lunar: usamos el instante absoluto del timestamp (new Date(iso)) →
//     la posición de la luna no depende de la TZ del observador.

import { moonPhaseId, type LunarPhaseId } from '@/lib/lunar/phase'
import { cyclePhase, type CyclePhaseId } from '@/lib/ciclo/phase'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import { isToneBearingInteraction } from '@/lib/person-logs/toneSignal'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import type { PersonCycleEntry, CyclePhase } from '@/lib/person-cycles/types'

// ─── Tipos de salida ───────────────────────────────────────────────

export interface PhaseBucket {
  phaseId: string
  label: string
  count: number
  /** Promedio de `value` (1-5). null si count < minSamplesPerBucket. */
  average: number | null
}

export interface PhaseDelta {
  high: PhaseBucket
  low: PhaseBucket
  /** high.average - low.average (siempre > 0). */
  diff: number
}

export interface MetricByPhase {
  kind: PersonLogKind
  /** Buckets en orden canónico de fase (incluye los vacíos, average=null). */
  buckets: PhaseBucket[]
  /** Total de logs de este kind que entraron en alguna fase. */
  totalSamples: number
  /** Mayor vs menor promedio entre buckets con datos suficientes (>=2). */
  delta: PhaseDelta | null
}

export interface CorrelationConfig {
  /** Kinds a correlacionar. Default: mood, energy, sleep, pain. */
  kinds?: PersonLogKind[]
  /** Mínimo de muestras por bucket para computar su promedio. Default 2. */
  minSamplesPerBucket?: number
  /** Mínimo total (por kind) para emitir el MetricByPhase. Default 3. */
  minTotalSamples?: number
}

const DEFAULT_KINDS: PersonLogKind[] = ['mood', 'energy', 'sleep', 'pain']

// ─── Metadata de fases (orden + label) ──────────────────────────────

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

const CYCLE_ORDER: Array<{ id: CyclePhaseId; label: string }> = [
  { id: 'menstrual', label: 'Menstrual' },
  { id: 'follicular', label: 'Folicular' },
  { id: 'ovulation', label: 'Ovulación' },
  { id: 'luteal', label: 'Lútea' },
]

const EXPLICIT_CYCLE_ORDER: Array<{ id: CyclePhase; label: string }> = [
  { id: 'bleeding', label: 'Sangrado' },
  { id: 'pms', label: 'PMS' },
  { id: 'mid_cycle', label: 'Medio del ciclo' },
  { id: 'ovulation', label: 'Ovulación' },
  { id: 'luteal', label: 'Lútea' },
  { id: 'unknown', label: 'Indefinida' },
]

// ─── Núcleo de agregación ───────────────────────────────────────────

interface Accumulator {
  sum: number
  count: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Construye los MetricByPhase para un set de logs, dado un clasificador
 * fase(log) → phaseId|null y un orden canónico de fases.
 *
 * Los logs cuyo clasificador devuelve null (ej. fecha previa al ciclo,
 * fecha inválida) NO se cuentan: no inventamos clasificación.
 */
function aggregate(
  logs: PersonLog[],
  order: Array<{ id: string; label: string }>,
  classify: (log: PersonLog) => string | null,
  config: CorrelationConfig,
): MetricByPhase[] {
  const kinds = config.kinds ?? DEFAULT_KINDS
  const minPerBucket = config.minSamplesPerBucket ?? 2
  const minTotal = config.minTotalSamples ?? 3

  // kind -> phaseId -> acumulador
  const byKind = new Map<PersonLogKind, Map<string, Accumulator>>()
  for (const k of kinds) byKind.set(k, new Map())

  for (const log of logs) {
    if (!kinds.includes(log.kind)) continue
    // El tono de una interacción solo cuenta si es real (no llamada/import-marker,
    // que son placeholders value=3 y aplastan el promedio).
    if (log.kind === 'interaction' && !isToneBearingInteraction(log.note)) continue
    if (!Number.isFinite(log.value) || log.value <= 0) continue
    const phaseId = classify(log)
    if (!phaseId) continue
    const acc = byKind.get(log.kind)!
    const cur = acc.get(phaseId) ?? { sum: 0, count: 0 }
    cur.sum += log.value
    cur.count += 1
    acc.set(phaseId, cur)
  }

  const result: MetricByPhase[] = []
  for (const kind of kinds) {
    const acc = byKind.get(kind)!
    const buckets: PhaseBucket[] = order.map(({ id, label }) => {
      const a = acc.get(id)
      const count = a?.count ?? 0
      const average = a && count >= minPerBucket ? round1(a.sum / count) : null
      return { phaseId: id, label, count, average }
    })

    const totalSamples = buckets.reduce((s, b) => s + b.count, 0)
    if (totalSamples < minTotal) continue // data insuficiente para este kind.

    result.push({
      kind,
      buckets,
      totalSamples,
      delta: computeDelta(buckets),
    })
  }
  return result
}

/** Mayor vs menor promedio entre buckets con average != null. Requiere >=2. */
function computeDelta(buckets: PhaseBucket[]): PhaseDelta | null {
  const withData = buckets.filter((b) => b.average != null)
  if (withData.length < 2) return null
  let high = withData[0]
  let low = withData[0]
  for (const b of withData) {
    if (b.average! > high.average!) high = b
    if (b.average! < low.average!) low = b
  }
  const diff = round1(high.average! - low.average!)
  if (diff <= 0) return null // todos iguales: no hay delta notable.
  return { high, low, diff }
}

// ─── Clasificadores ─────────────────────────────────────────────────

/**
 * Correlación contra la fase LUNAR del día de cada log. Global: no depende
 * de ninguna persona.
 */
export function correlateByLunarPhase(
  logs: PersonLog[],
  config: CorrelationConfig = {},
): MetricByPhase[] {
  return aggregate(logs, LUNAR_ORDER, (log) => {
    const d = new Date(log.loggedAt)
    if (Number.isNaN(d.getTime())) return null
    return moonPhaseId(d)
  }, config)
}

/**
 * Correlación contra la fase del CICLO en la fecha de cada log. Requiere el
 * cycleStartDate de la persona. Logs anteriores al inicio del ciclo (o con
 * fecha inválida) se descartan: cyclePhase devuelve null y no se cuentan.
 */
export function correlateByCyclePhase(
  logs: PersonLog[],
  cycleStartDate: string | null | undefined,
  cycleLengthDays: number | null | undefined,
  config: CorrelationConfig = {},
): MetricByPhase[] {
  if (!cycleStartDate) return []
  const length = cycleLengthDays ?? 28
  return aggregate(logs, CYCLE_ORDER, (log) => {
    const d = parseLocalDate(log.loggedAt)
    if (!d) return null
    const phase = cyclePhase(cycleStartDate, length, d)
    return phase ? phase.phase : null
  }, config)
}

/**
 * Correlación contra el ciclo EXPLÍCITO (person_cycles, mig 0110). Usa el
 * fase registrado día por día por Aaron (o self_report) — más preciso que
 * el cálculo por fórmula cycleStartDate+length. Sirve para cruzar cómo
 * Aaron se siente en cada interacción con la fase REAL de la persona ese
 * día ("¿discutimos más cuando está sangrando?").
 *
 * Índice por YYYY-MM-DD del día del cycle entry. Si un log cae en un día
 * SIN entry, no se cuenta.
 */
export function correlateByExplicitCyclePhase(
  logs: PersonLog[],
  cycles: PersonCycleEntry[],
  config: CorrelationConfig = {},
): MetricByPhase[] {
  if (!cycles || cycles.length === 0) return []
  const byDay = new Map<string, CyclePhase>()
  for (const c of cycles) byDay.set(c.date, c.phase)
  return aggregate(logs, EXPLICIT_CYCLE_ORDER as Array<{ id: string; label: string }>, (log) => {
    const d = parseLocalDate(log.loggedAt)
    if (!d) return null
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return byDay.get(ymd) ?? null
  }, config)
}
