// SIR V2 — Tests de la recalibración del forecast conductual.

import { describe, it, expect } from 'vitest'
import { deriveLabel, recalibrate, modelWeights } from './recalibrate'

describe('deriveLabel', () => {
  it('"no pasó nada" → miss', () => expect(deriveLabel(['no_paso_nada'])).toBe('miss'))
  it('varios patrones → hit', () => expect(deriveLabel(['pms', 'dolor'])).toBe('hit'))
  it('un patrón + evento externo → partial', () => expect(deriveLabel(['conflicto', 'evento_externo'])).toBe('partial'))
  it('solo evento externo → noise (ruido contextual, §17)', () => expect(deriveLabel(['evento_externo'])).toBe('noise'))
  it('período confirmado → hit', () => expect(deriveLabel(['periodo'])).toBe('hit'))
})

describe('recalibrate', () => {
  it('sin data → hitRate null, no validado', () => {
    expect(recalibrate([])).toMatchObject({ hitRate: null, validated: false, confidenceDelta: 0 })
  })
  it('excluye el ruido del hit-rate', () => {
    const r = recalibrate(['hit', 'hit', 'noise', 'noise'])
    expect(r.evaluated).toBe(2) // los noise no cuentan
    expect(r.hitRate).toBe(1)
  })
  it('3+ evaluadas con buen hit-rate → validado + boost positivo', () => {
    const r = recalibrate(['hit', 'hit', 'hit', 'miss'])
    expect(r.validated).toBe(true)
    expect(r.confidenceDelta).toBeGreaterThan(0)
  })
  it('mayoría miss → penalización', () => {
    const r = recalibrate(['miss', 'miss', 'miss', 'hit'])
    expect(r.validated).toBe(false)
    expect(r.confidenceDelta).toBeLessThan(0)
  })
})

describe('modelWeights', () => {
  it('un modelo que acierta sube (>1), uno que falla baja (<1)', () => {
    const w = modelWeights([
      { label: 'hit', models: ['grid'] }, { label: 'hit', models: ['grid'] },
      { label: 'miss', models: ['harmonic'] }, { label: 'miss', models: ['harmonic'] },
    ])
    expect(w.grid).toBeGreaterThan(1)
    expect(w.harmonic).toBeLessThan(1)
  })
  it('poca evidencia (<2) → no ajusta', () => {
    expect(modelWeights([{ label: 'hit', models: ['grid'] }])).toEqual({})
  })
  it('el ruido no enseña', () => {
    expect(modelWeights([{ label: 'noise', models: ['grid'] }, { label: 'noise', models: ['grid'] }])).toEqual({})
  })
})
