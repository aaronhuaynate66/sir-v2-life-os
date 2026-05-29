// SIR V2 — Validación manual del JSON que devuelve Claude Vision.
// Sin zod: type guard puro para no agregar dep.

import type { ScaleCaptureExtracted, ScaleMetric } from './types'
import { SCALE_METRICS_ORDER } from './types'

const SCALE_METRIC_SET = new Set<ScaleMetric>(SCALE_METRICS_ORDER)

function isStringOrNull(v: unknown): boolean {
  return v === null || typeof v === 'string'
}

function isNumberOrNullish(v: unknown): boolean {
  // null, undefined, o number finito (no NaN, no Infinity)
  if (v === null || v === undefined) return true
  return typeof v === 'number' && Number.isFinite(v)
}

export function isValidScaleCaptureExtracted(x: unknown): x is ScaleCaptureExtracted {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>

  if (!isStringOrNull(o.measured_at)) return false

  if (!o.metrics || typeof o.metrics !== 'object') return false
  const metrics = o.metrics as Record<string, unknown>
  for (const [key, value] of Object.entries(metrics)) {
    if (!SCALE_METRIC_SET.has(key as ScaleMetric)) {
      // El modelo agrego una key que no esperabamos — ok, la ignoramos
      // pero no fail. La sanitizacion ocurre al construir HealthMetric[].
      continue
    }
    if (!isNumberOrNullish(value)) return false
  }

  if (o.confidence !== 'high' && o.confidence !== 'medium' && o.confidence !== 'low') return false

  if (o.raw_observations !== undefined && typeof o.raw_observations !== 'string') return false

  return true
}

/**
 * Sanitiza el objeto: solo conserva keys de ScaleMetric, descarta null/undefined
 * de las metricas, y trim raw_observations a 200 chars.
 */
export function sanitizeExtracted(raw: ScaleCaptureExtracted): ScaleCaptureExtracted {
  const cleanMetrics: Partial<Record<ScaleMetric, number>> = {}
  for (const key of SCALE_METRICS_ORDER) {
    const v = raw.metrics?.[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      cleanMetrics[key] = v
    }
  }

  return {
    measured_at: raw.measured_at,
    metrics: cleanMetrics,
    confidence: raw.confidence,
    raw_observations:
      typeof raw.raw_observations === 'string'
        ? raw.raw_observations.slice(0, 200).trim() || undefined
        : undefined,
  }
}
