// SIR V2 — Validación del JSON de Claude Vision (VFC/HRV). Type guard puro.
import type { HrvPanelExtracted } from './types'

const MS_MIN = 1
const MS_MAX = 400

function isNumberOrNullish(v: unknown): boolean {
  if (v === null || v === undefined) return true
  return typeof v === 'number' && Number.isFinite(v)
}
function isStringOrNull(v: unknown): boolean {
  return v === null || typeof v === 'string'
}

export function isValidHrvPanelExtracted(x: unknown): x is HrvPanelExtracted {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (!isStringOrNull(o.date)) return false
  if (!isNumberOrNullish(o.resting_ms)) return false
  if (!isNumberOrNullish(o.min_ms)) return false
  if (!isNumberOrNullish(o.max_ms)) return false
  if (!isNumberOrNullish(o.avg_ms)) return false
  if (o.confidence !== 'high' && o.confidence !== 'medium' && o.confidence !== 'low') return false
  if (o.raw_observations !== undefined && typeof o.raw_observations !== 'string') return false
  return true
}

function sanitizeMs(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const n = Math.round(v)
  if (n < MS_MIN || n > MS_MAX) return null
  return n
}
function sanitizeDay(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function sanitizeHrvPanelExtracted(raw: HrvPanelExtracted): HrvPanelExtracted {
  return {
    date: sanitizeDay(raw.date),
    resting_ms: sanitizeMs(raw.resting_ms),
    min_ms: sanitizeMs(raw.min_ms),
    max_ms: sanitizeMs(raw.max_ms),
    avg_ms: sanitizeMs(raw.avg_ms),
    confidence: raw.confidence,
    raw_observations:
      typeof raw.raw_observations === 'string'
        ? raw.raw_observations.slice(0, 200).trim() || undefined
        : undefined,
  }
}
