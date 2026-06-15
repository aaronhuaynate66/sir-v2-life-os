// SIR V2 — Mapeo PURO de una captura de panel de VFC a HealthMetric[].
// Espeja hr/map.ts pero en ms y tipos hrv_*. Dedupe por día (id estable).

import type { HealthMetric, HealthMetricType } from '@/types'
import { parseLocalDate, toIsoLocal } from '@/lib/dates/parseLocalDate'
import type { HrvCaptureFinal } from './types'

const UNIT = 'ms'
const RANGE_NOTE = 'Rango diario · captura VFC'
const AVG_NOTE = 'Promedio/reposo · captura VFC'

export function hrvDedupeBaseId(day: string): string {
  return `shot:hrv:${day}`
}
export function hrvMetricId(day: string, type: HealthMetricType): string {
  return `${hrvDedupeBaseId(day)}:${type}`
}
export function resolveHrvDay(extractedDate: string | null | undefined, fallbackDay: string): string {
  const parsed = parseLocalDate(extractedDate)
  if (parsed) return toIsoLocal(parsed)
  return fallbackDay
}
export function hrvTimestampForDay(day: string): string {
  return `${day}T12:00:00.000Z`
}

/**
 * Construye los HealthMetric (hrv_min/max/avg, ms). La fila "avg" usa avg_ms si
 * está, si no resting_ms (valor representativo). Reordena min/max si invertidos.
 */
export function buildHrvHealthMetrics(final: HrvCaptureFinal): HealthMetric[] {
  const timestamp = hrvTimestampForDay(final.day)
  let minMs = final.minMs
  let maxMs = final.maxMs
  if (minMs !== null && maxMs !== null && minMs > maxMs) {
    ;[minMs, maxMs] = [maxMs, minMs]
  }
  const avg = final.avgMs ?? final.restingMs

  const rows: HealthMetric[] = []
  const push = (type: HealthMetricType, value: number | null, note: string) => {
    if (value === null || !Number.isFinite(value)) return
    rows.push({ id: hrvMetricId(final.day, type), type, value, unit: UNIT, timestamp, note })
  }
  push('hrv_avg', avg, `${AVG_NOTE} (conf. ${final.confidence})`)
  push('hrv_min', minMs, RANGE_NOTE)
  push('hrv_max', maxMs, RANGE_NOTE)
  return rows
}
