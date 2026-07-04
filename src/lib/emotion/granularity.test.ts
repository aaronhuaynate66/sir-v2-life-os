// SIR V2 — Tests de granularidad emocional (13·M3).

import { describe, it, expect } from 'vitest'
import { proposeEmotionLabels, emotionalDiversity } from './granularity'

describe('proposeEmotionLabels', () => {
  it('ánimo bajo → emociones negativas finas', () => {
    const r = proposeEmotionLabels(2)
    expect(r).toContain('angustia')
    expect(r.length).toBeLessThanOrEqual(6)
  })

  it('ánimo alto → emociones positivas finas', () => {
    const r = proposeEmotionLabels(9)
    expect(r).toContain('gratitud')
  })

  it('banda media', () => {
    expect(proposeEmotionLabels(6)).toContain('cansancio')
  })

  it('clampa fuera de rango y maneja NaN', () => {
    expect(proposeEmotionLabels(99).length).toBeGreaterThan(0)
    expect(proposeEmotionLabels(NaN)).toEqual([])
  })
})

describe('emotionalDiversity', () => {
  it('cuenta emociones finas distintas en las notas', () => {
    const r = emotionalDiversity([
      'hoy sentí mucha frustración con el laburo',
      'estaba con frustración de nuevo y algo de ansiedad',
      'un poco de gratitud al final del día',
      null,
      'nada relevante',
    ])
    expect(r.distinct).toBe(3) // frustracion, ansiedad, gratitud (frustración se cuenta 1 vez)
    expect(r.used).toContain('frustracion')
    expect(r.used).toContain('gratitud')
  })

  it('sin emociones reconocidas → 0', () => {
    expect(emotionalDiversity(['fui al gimnasio', '']).distinct).toBe(0)
  })
})
