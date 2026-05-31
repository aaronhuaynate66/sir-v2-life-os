// SIR V2 — Mapeo PURO de una captura de báscula a HealthMetric[].
//
// Aislado de Supabase/store para ser testeable de forma determinista:
//   - buildScaleHealthMetrics: (métricas + contexto) -> HealthMetric[]
//   - resolveScaleMeasuredAt:  ISO del screenshot (o fallback now) -> ISO
//
// Lo consume persistScaleCapture (client.ts) y el branch de /captura. El
// peso (type='weight') queda trackeable en el tiempo para el chart de
// tendencia de /yo, que lee health_metrics filtrando por type.

import type { HealthMetric } from '@/types'
import type { ScaleMetric } from './types'
import { SCALE_METRICS_ORDER, SCALE_METRIC_MAPPING } from './types'

export interface BuildScaleMetricsArgs {
  /** Subset de las 13 métricas (las editadas/confirmadas por el usuario).
   *  Solo las de valor numérico finito se materializan. */
  finalMetrics: Partial<Record<ScaleMetric, number>>
  /** Agrupa las N filas que salieron de la misma imagen. */
  captureId: string
  /** Storage path del screenshot original en el bucket scale-captures. */
  sourceImagePath: string
  /** ISO 8601 de la medición — va a `timestamp` de cada HealthMetric. */
  measuredAt: string
  /** Confianza del Vision, solo para la nota legible (opcional). */
  confidence?: 'high' | 'medium' | 'low'
}

/**
 * Construye un HealthMetric por cada métrica con valor numérico finito,
 * respetando el orden canónico (peso primero). Cada fila comparte
 * captureId/sourceImagePath/timestamp y queda marcada captureType='scale'.
 *
 * Determinista y sin efectos: el caller decide cómo persistir.
 */
export function buildScaleHealthMetrics(args: BuildScaleMetricsArgs): HealthMetric[] {
  const note = args.confidence
    ? `Captura báscula (conf. ${args.confidence})`
    : 'Captura báscula'

  const metrics: HealthMetric[] = []
  for (const key of SCALE_METRICS_ORDER) {
    const value = args.finalMetrics[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const mapping = SCALE_METRIC_MAPPING[key]
    metrics.push({
      id: `${args.captureId}__${key}`,
      type: mapping.healthType,
      value,
      unit: mapping.unit,
      timestamp: args.measuredAt,
      captureId: args.captureId,
      sourceImagePath: args.sourceImagePath,
      captureType: 'scale',
      note,
    })
  }
  return metrics
}

/**
 * Resuelve el `measured_at` que reporta Vision a un ISO 8601 válido.
 * Si el screenshot no tenía fecha legible (null) o la fecha es inválida,
 * cae al `fallback` (default: ahora) — la medición se sella al momento de
 * la captura, nunca queda sin timestamp.
 */
export function resolveScaleMeasuredAt(
  extractedIso: string | null | undefined,
  fallback: Date = new Date(),
): string {
  if (typeof extractedIso === 'string' && extractedIso.length > 0) {
    const d = new Date(extractedIso)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  return fallback.toISOString()
}
