// SIR V2 — Validación + sanitización de TrackerExtracted (puro, testeable).

import type { ExtractConfidence, TrackerExtracted } from './types'

const CONFIDENCES: readonly ExtractConfidence[] = ['high', 'medium', 'low']

function isConfidence(x: unknown): x is ExtractConfidence {
  return typeof x === 'string' && (CONFIDENCES as readonly string[]).includes(x)
}

/** ¿El objeto parsea como TrackerExtracted? Tolerante a value/unit/date null. */
export function isValidTrackerExtracted(x: unknown): x is TrackerExtracted {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  const valueOk = o.value === null || typeof o.value === 'number'
  const unitOk = o.unit === null || typeof o.unit === 'string'
  const dateOk = o.date === null || typeof o.date === 'string'
  return valueOk && unitOk && dateOk && isConfidence(o.confidence) && typeof o.raw_observations === 'string'
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Limpia/normaliza: value finito, date ISO válida o null, observaciones recortadas. */
export function sanitizeTrackerExtracted(x: TrackerExtracted): TrackerExtracted {
  let value: number | null = null
  if (typeof x.value === 'number' && Number.isFinite(x.value)) value = x.value

  let date: string | null = null
  if (typeof x.date === 'string') {
    const m = x.date.match(ISO_DATE)
    if (m) {
      const mo = Number(m[2])
      const d = Number(m[3])
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) date = x.date
    }
  }

  let unit: string | null = null
  if (typeof x.unit === 'string') {
    const t = x.unit.trim()
    if (t.length > 0 && t.length <= 12) unit = t
  }

  return {
    value,
    unit,
    date,
    confidence: x.confidence,
    raw_observations: (x.raw_observations ?? '').slice(0, 200),
  }
}
