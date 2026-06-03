// SIR V2 — Tests de validación/sanitización de TrackerExtracted.

import { describe, it, expect } from 'vitest'
import { isValidTrackerExtracted, sanitizeTrackerExtracted } from './validate'
import type { TrackerExtracted } from './types'

describe('isValidTrackerExtracted', () => {
  it('acepta un objeto completo', () => {
    expect(
      isValidTrackerExtracted({ value: 5075, unit: 'PEN', date: '2026-06-03', confidence: 'high', raw_observations: 'ok' }),
    ).toBe(true)
  })
  it('acepta nulls en value/unit/date', () => {
    expect(
      isValidTrackerExtracted({ value: null, unit: null, date: null, confidence: 'low', raw_observations: '' }),
    ).toBe(true)
  })
  it('rechaza confidence inválida', () => {
    expect(
      isValidTrackerExtracted({ value: 1, unit: null, date: null, confidence: 'altísima', raw_observations: '' }),
    ).toBe(false)
  })
  it('rechaza value string', () => {
    expect(
      isValidTrackerExtracted({ value: '5075', unit: null, date: null, confidence: 'high', raw_observations: '' }),
    ).toBe(false)
  })
  it('rechaza no-objeto', () => {
    expect(isValidTrackerExtracted(null)).toBe(false)
    expect(isValidTrackerExtracted('x')).toBe(false)
  })
})

describe('sanitizeTrackerExtracted', () => {
  it('deja value finito y date ISO válida', () => {
    const r = sanitizeTrackerExtracted({ value: 5075, unit: ' PEN ', date: '2026-06-03', confidence: 'high', raw_observations: 'x' } as TrackerExtracted)
    expect(r.value).toBe(5075)
    expect(r.unit).toBe('PEN')
    expect(r.date).toBe('2026-06-03')
  })
  it('descarta date inválida', () => {
    const r = sanitizeTrackerExtracted({ value: 1, unit: null, date: '2026-13-40', confidence: 'low', raw_observations: '' } as TrackerExtracted)
    expect(r.date).toBeNull()
  })
  it('value no finito → null', () => {
    const r = sanitizeTrackerExtracted({ value: Number.POSITIVE_INFINITY, unit: null, date: null, confidence: 'low', raw_observations: '' } as TrackerExtracted)
    expect(r.value).toBeNull()
  })
  it('recorta observaciones a 200 chars', () => {
    const long = 'a'.repeat(500)
    const r = sanitizeTrackerExtracted({ value: 1, unit: null, date: null, confidence: 'low', raw_observations: long } as TrackerExtracted)
    expect(r.raw_observations).toHaveLength(200)
  })
  it('unit vacía o demasiado larga → null', () => {
    expect(sanitizeTrackerExtracted({ value: 1, unit: '   ', date: null, confidence: 'low', raw_observations: '' } as TrackerExtracted).unit).toBeNull()
    expect(sanitizeTrackerExtracted({ value: 1, unit: 'x'.repeat(20), date: null, confidence: 'low', raw_observations: '' } as TrackerExtracted).unit).toBeNull()
  })
})
