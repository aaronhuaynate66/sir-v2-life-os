// SIR V2 — Adapters de dominio → SeriesPoint[] para charts (Feature 3).
//
// Cada adapter mapea una entidad del proyecto a puntos {date, value} listos
// para buildLineSeries. Mantener la lógica de dominio acá (testeable) y la
// geometría en series.ts (testeable) mantiene los componentes tontos.

import type {
  FinancialMovement,
  SelfMetric,
  SleepRecord,
  MetricCategory,
  HealthMetric,
  HealthMetricType,
} from '@/types'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import { aggregateByDay, type SeriesPoint } from './series'

/** Signo en PEN de un movimiento según su tipo (income suma, resto resta). */
function signedPEN(m: FinancialMovement): number {
  return m.type === 'income' ? m.amountPEN : -m.amountPEN
}

/**
 * Balance financiero ACUMULADO en el tiempo (PEN). Ordena por fecha y suma
 * corrido el neto de cada día. El último punto es el balance total histórico.
 *
 * Devuelve un punto por día (suma de los movimientos de ese día, acumulada).
 */
export function financeBalanceSeries(movements: FinancialMovement[]): SeriesPoint[] {
  // Neto por día.
  const daily = aggregateByDay(
    movements.map((m) => ({ date: m.date, value: signedPEN(m) })),
    'sum',
  )
  // aggregateByDay no garantiza orden → ordenar por fecha antes de acumular.
  daily.sort((a, b) => {
    const ta = parseLocalDate(a.date)?.getTime() ?? 0
    const tb = parseLocalDate(b.date)?.getTime() ?? 0
    return ta - tb
  })
  let running = 0
  return daily.map((d) => {
    running += d.value
    return { date: d.date, value: Math.round(running * 100) / 100 }
  })
}

/** Neto financiero POR DÍA (no acumulado): útil para ver entradas/salidas. */
export function financeDailyNetSeries(movements: FinancialMovement[]): SeriesPoint[] {
  return aggregateByDay(
    movements.map((m) => ({ date: m.date, value: signedPEN(m) })),
    'sum',
  )
}

/** Serie de una categoría de self-metric (ej. energía) — promedio por día. */
export function selfMetricSeries(
  metrics: SelfMetric[],
  category: MetricCategory,
): SeriesPoint[] {
  return aggregateByDay(
    metrics
      .filter((m) => m.category === category)
      .map((m) => ({ date: m.timestamp, value: m.value })),
    'avg',
  )
}

/** Duración de sueño (horas) por noche. Un punto por registro (por date). */
export function sleepDurationSeries(records: SleepRecord[]): SeriesPoint[] {
  return aggregateByDay(
    records.map((r) => ({ date: r.date, value: r.duration })),
    'last',
  )
}

/** Calidad de sueño (1-10) por noche. */
export function sleepQualitySeries(records: SleepRecord[]): SeriesPoint[] {
  return aggregateByDay(
    records.map((r) => ({ date: r.date, value: r.quality })),
    'last',
  )
}

/**
 * Serie temporal de una MÉTRICA CORPORAL (health_metrics) de un tipo dado
 * (ej. 'weight'), para el chart de tendencia de /yo.
 *
 * La báscula inserta N tipos (peso, IMC, grasa…) por captura con el MISMO
 * timestamp; filtramos por tipo y agregamos por día (último valor del día,
 * por orden cronológico) → una serie limpia, sin libs de charting. Pre-orden
 * por timestamp para que 'last' sea la lectura más reciente del día y la
 * salida quede cronológica (dedup de lecturas del mismo día).
 */
export function healthMetricSeries(
  metrics: HealthMetric[],
  type: HealthMetricType,
): SeriesPoint[] {
  const points = metrics
    .filter((m) => m.type === type && Number.isFinite(m.value))
    .map((m) => ({ date: m.timestamp, value: m.value }))
    .sort((a, b) => a.date.localeCompare(b.date)) // ISO → orden cronológico
  return aggregateByDay(points, 'last')
}

/**
 * Tono de interacción por persona en el tiempo (person_logs kind dado,
 * default 'interaction', escala 1-5). Promedio por día.
 */
export function personLogToneSeries(
  logs: PersonLog[],
  kind: PersonLogKind = 'interaction',
): SeriesPoint[] {
  return aggregateByDay(
    logs
      .filter((l) => l.kind === kind && Number.isFinite(l.value) && l.value > 0)
      .map((l) => ({ date: l.loggedAt, value: l.value })),
    'avg',
  )
}
