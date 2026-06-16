// SIR V2 — Validación manual del JSON que devuelve Claude Vision (sueño).
// Sin zod: type guard puro, en línea con scale/validate.ts.

import type { SleepPanelExtracted, SleepStageMinutes } from './types'

function isNumberOrNullish(v: unknown): boolean {
  // null, undefined, o number finito (no NaN, no Infinity)
  if (v === null || v === undefined) return true
  return typeof v === 'number' && Number.isFinite(v)
}

function isStringOrNull(v: unknown): boolean {
  return v === null || typeof v === 'string'
}

function isStagesShape(v: unknown): boolean {
  if (v === null || v === undefined) return true // tolerante: stages ausente
  if (typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  // Cada fase: number finito, null o ausente. Keys extra se ignoran al sanitizar.
  return (
    isNumberOrNullish(o.deep_minutes) &&
    isNumberOrNullish(o.light_minutes) &&
    isNumberOrNullish(o.rem_minutes) &&
    isNumberOrNullish(o.awake_minutes)
  )
}

export function isValidSleepPanelExtracted(x: unknown): x is SleepPanelExtracted {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>

  if (!isStringOrNull(o.date)) return false
  if (!isNumberOrNullish(o.total_minutes)) return false
  if (!isStringOrNull(o.bedtime)) return false
  if (!isStringOrNull(o.wake_time)) return false
  if (!isStagesShape(o.stages)) return false
  if (!isNumberOrNullish(o.score)) return false
  if (!isNumberOrNullish(o.awakenings)) return false
  if (!isNumberOrNullish(o.respiratory_rate)) return false
  if (!isNumberOrNullish(o.spo2_avg)) return false
  if (!isNumberOrNullish(o.nap_minutes)) return false

  if (o.confidence !== 'high' && o.confidence !== 'medium' && o.confidence !== 'low') {
    return false
  }
  if (o.raw_observations !== undefined && typeof o.raw_observations !== 'string') return false

  return true
}

/** Normaliza una hora a 'HH:mm' 24h, o null si no parsea. Tolera "1:29",
 *  "01:29", "01:29:00". (Vision ya debería entregar 24h; esto es defensivo.) */
function sanitizeHm(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Minutos enteros >= 0 o null. */
function sanitizeMinutes(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
  return Math.round(v)
}

function sanitizeStages(v: unknown): SleepStageMinutes {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    deep_minutes: sanitizeMinutes(o.deep_minutes),
    light_minutes: sanitizeMinutes(o.light_minutes),
    rem_minutes: sanitizeMinutes(o.rem_minutes),
    awake_minutes: sanitizeMinutes(o.awake_minutes),
  }
}

/** Día 'YYYY-MM-DD' o null (sólo conserva el prefijo de fecha). */
function sanitizeDay(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** Score 0-100 entero, o null. Clampa fuera de rango. */
function sanitizeScore(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.min(100, Math.max(0, Math.round(v)))
}

/** Conteo entero >= 0 o null. */
function sanitizeCount(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
  return Math.round(v)
}
/** Número positivo (1 decimal) o null. */
function sanitizePos(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
  return Math.round(v * 10) / 10
}
/** Porcentaje 0-100 o null. */
function sanitizePct(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.min(100, Math.max(0, Math.round(v)))
}

/**
 * Sanitiza el objeto: normaliza horas, minutos, día y score; trim de notas.
 */
export function sanitizeSleepPanelExtracted(raw: SleepPanelExtracted): SleepPanelExtracted {
  return {
    date: sanitizeDay(raw.date),
    total_minutes: sanitizeMinutes(raw.total_minutes),
    bedtime: sanitizeHm(raw.bedtime),
    wake_time: sanitizeHm(raw.wake_time),
    stages: sanitizeStages(raw.stages),
    score: sanitizeScore(raw.score),
    awakenings: sanitizeCount(raw.awakenings),
    respiratory_rate: sanitizePos(raw.respiratory_rate),
    spo2_avg: sanitizePct(raw.spo2_avg),
    nap_minutes: sanitizeMinutes(raw.nap_minutes),
    confidence: raw.confidence,
    raw_observations:
      typeof raw.raw_observations === 'string'
        ? raw.raw_observations.slice(0, 200).trim() || undefined
        : undefined,
  }
}
