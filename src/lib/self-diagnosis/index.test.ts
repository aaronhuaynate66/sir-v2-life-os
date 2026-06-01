import { describe, it, expect } from 'vitest'
import type { SelfDiagnosis } from '@/types'
import {
  emptyDiagnosis,
  isDiagnosisEmpty,
  countFilledFields,
  normalizeDiagnosis,
  DIAGNOSIS_TOTAL_FIELDS,
} from './index'

describe('emptyDiagnosis', () => {
  it('crea un diagnóstico vacío con el id dado y epoch como updatedAt', () => {
    const d = emptyDiagnosis('diag_1')
    expect(d.id).toBe('diag_1')
    expect(d.emotionalState).toBe('')
    expect(d.anxieties).toEqual([])
    expect(d.anchors).toEqual([])
    expect(new Date(d.updatedAt).getTime()).toBe(0)
  })
})

describe('isDiagnosisEmpty', () => {
  it('es true para null/undefined', () => {
    expect(isDiagnosisEmpty(null)).toBe(true)
    expect(isDiagnosisEmpty(undefined)).toBe(true)
  })
  it('es true para un diagnóstico recién creado', () => {
    expect(isDiagnosisEmpty(emptyDiagnosis('x'))).toBe(true)
  })
  it('whitespace-only no cuenta como contenido', () => {
    const d = { ...emptyDiagnosis('x'), emotionalState: '   \n  ' }
    expect(isDiagnosisEmpty(d)).toBe(true)
  })
  it('es false si hay texto', () => {
    const d = { ...emptyDiagnosis('x'), idealLifeVision: 'paz' }
    expect(isDiagnosisEmpty(d)).toBe(false)
  })
  it('es false si hay un ítem de lista', () => {
    const d = { ...emptyDiagnosis('x'), anxieties: ['plata'] }
    expect(isDiagnosisEmpty(d)).toBe(false)
  })
})

describe('countFilledFields', () => {
  it('cuenta texto + listas con contenido', () => {
    const d: SelfDiagnosis = {
      ...emptyDiagnosis('x'),
      emotionalState: 'cansado',
      anxieties: ['plata'],
      anchors: ['menos es más'],
    }
    expect(countFilledFields(d)).toBe(3)
  })
  it('0 para vacío, y nunca supera el total', () => {
    expect(countFilledFields(emptyDiagnosis('x'))).toBe(0)
    const full: SelfDiagnosis = {
      id: 'x',
      emotionalState: 'a',
      anxieties: ['a'],
      blocks: ['a'],
      stoppedTolerating: ['a'],
      understandings: ['a'],
      anchors: ['a'],
      idealLifeVision: 'a',
      futureSelf: 'a',
      updatedAt: new Date(0).toISOString(),
    }
    expect(countFilledFields(full)).toBe(DIAGNOSIS_TOTAL_FIELDS)
  })
})

describe('normalizeDiagnosis', () => {
  it('recorta textos y limpia/dedup listas', () => {
    const draft: SelfDiagnosis = {
      ...emptyDiagnosis('x'),
      emotionalState: '  ansioso  ',
      anxieties: [' plata ', 'plata', '', '   ', 'trabajo'],
      idealLifeVision: '  vivir tranquilo ',
    }
    const out = normalizeDiagnosis(draft)
    expect(out.emotionalState).toBe('ansioso')
    expect(out.anxieties).toEqual(['plata', 'trabajo'])
    expect(out.idealLifeVision).toBe('vivir tranquilo')
  })
  it('no muta el draft original', () => {
    const draft = { ...emptyDiagnosis('x'), anxieties: ['a', 'a'] }
    const before = [...draft.anxieties]
    normalizeDiagnosis(draft)
    expect(draft.anxieties).toEqual(before)
  })
  it('preserva id y updatedAt', () => {
    const draft = { ...emptyDiagnosis('keep'), updatedAt: '2026-05-31T00:00:00.000Z' }
    const out = normalizeDiagnosis(draft)
    expect(out.id).toBe('keep')
    expect(out.updatedAt).toBe('2026-05-31T00:00:00.000Z')
  })
})
