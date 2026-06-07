// SIR V2 — Validación manual del JSON que devuelve Claude Vision (FC).
// Sin zod: type guard puro, en línea con scale/validate.ts y sleep/validate.ts.

import type { HeartRatePanelExtracted } from './types'

/** Rango plausible de pulsaciones por minuto humanas. Fuera de él → null. */
const BPM_MIN = 20
const BPM_MAX = 250

function isNumberOrNullish(v: unknown): boolean {
  // null, undefined, o number finito (no NaN, no Infinity)
  if (v === null || v === undefined) return true
  return typeof v === 'number' && Number.isFinite(v)
}

function isStringOrNull(v: unknown): boolean {
  return v === null || typeof v === 'string'
}

export function isValidHeartRatePanelExtracted(x: unknown): x is HeartRatePanelExtracted {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>

  if (!isStringOrNull(o.date)) return false
  if (!isNumberOrNullish(o.resting_bpm)) return false
  if (!isNumberOrNullish(o.min_bpm)) return false
  if (!isNumberOrNullish(o.max_bpm)) return false
  if (!isNumberOrNullish(o.avg_bpm)) return false
  if (!isNumberOrNullish(o.high_alerts)) return false
  if (!isNumberOrNullish(o.low_alerts)) return false

  if (o.confidence !== 'high' && o.confidence !== 'medium' && o.confidence !== 'low') {
    return false
  }
  if (o.raw_observations !== undefined && typeof o.raw_observations !== 'string') return false

  return true
}

/** BPM entero dentro de rango plausible, o null. */
function sanitizeBpm(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const n = Math.round(v)
  if (n < BPM_MIN || n > BPM_MAX) return null
  return n
}

/** Conteo de alertas: entero >= 0, o null. */
function sanitizeCount(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
  return Math.round(v)
}

/** Día 'YYYY-MM-DD' o null (sólo conserva el prefijo de fecha). */
function sanitizeDay(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/**
 * Sanitiza el objeto: normaliza BPM (clamp a rango plausible), conteos, día;
 * trim de notas.
 */
export function sanitizeHeartRatePanelExtracted(
  raw: HeartRatePanelExtracted,
): HeartRatePanelExtracted {
  return {
    date: sanitizeDay(raw.date),
    resting_bpm: sanitizeBpm(raw.resting_bpm),
    min_bpm: sanitizeBpm(raw.min_bpm),
    max_bpm: sanitizeBpm(raw.max_bpm),
    avg_bpm: sanitizeBpm(raw.avg_bpm),
    high_alerts: sanitizeCount(raw.high_alerts),
    low_alerts: sanitizeCount(raw.low_alerts),
    confidence: raw.confidence,
    raw_observations:
      typeof raw.raw_observations === 'string'
        ? raw.raw_observations.slice(0, 200).trim() || undefined
        : undefined,
  }
}
