// SIR V2 — Tests del gating SMART (objetivo bien definido antes del plan).

import { describe, it, expect } from 'vitest'

import { isGoalSmartComplete, missingSmartFields, type SmartGoalFields } from './smart'

const COMPLETE: SmartGoalFields = {
  target: 'Pesar 75 kg',
  baseline: '82 kg',
  targetDate: '2026-12-31',
  why: 'Quiero competir en mi categoría',
}

describe('missingSmartFields', () => {
  it('objetivo completo → sin faltantes', () => {
    expect(missingSmartFields(COMPLETE)).toEqual([])
  })

  it('detecta cada campo faltante en el orden del wizard', () => {
    expect(missingSmartFields({})).toEqual(['measurable', 'baseline', 'timeBound', 'relevant'])
  })

  it('trata strings vacíos o de sólo espacios como faltantes', () => {
    expect(missingSmartFields({ ...COMPLETE, baseline: '   ', why: '' })).toEqual(['baseline', 'relevant'])
  })

  it('falta sólo la fecha límite', () => {
    expect(missingSmartFields({ ...COMPLETE, targetDate: undefined })).toEqual(['timeBound'])
  })
})

describe('isGoalSmartComplete', () => {
  it('true sólo cuando target + baseline + fecha + por qué están', () => {
    expect(isGoalSmartComplete(COMPLETE)).toBe(true)
  })

  it('false si falta cualquiera', () => {
    expect(isGoalSmartComplete({ ...COMPLETE, target: undefined })).toBe(false)
    expect(isGoalSmartComplete({ ...COMPLETE, baseline: '' })).toBe(false)
    expect(isGoalSmartComplete({ ...COMPLETE, targetDate: undefined })).toBe(false)
    expect(isGoalSmartComplete({ ...COMPLETE, why: '  ' })).toBe(false)
  })
})
