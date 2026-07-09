import { describe, it, expect } from 'vitest'

import { describeUsualPattern } from './describe'

describe('describeUsualPattern', () => {
  it('null/undefined → null', () => {
    expect(describeUsualPattern(null)).toBeNull()
    expect(describeUsualPattern(undefined)).toBeNull()
  })

  it('todo bajo el umbral → null', () => {
    expect(describeUsualPattern({ friction: 0.04, withdrawal: 0, sensitivity: -0.1, somatic: 0.05 })).toBeNull()
  })

  it('una sola señal, sin coma ni "y"', () => {
    const r = describeUsualPattern({ friction: 0.74, withdrawal: 0, sensitivity: 0, somatic: 0 })
    expect(r).toBe('bastante más fricción o irritabilidad')
  })

  it('rankea de mayor a menor Δ y usa el cuantificador por intensidad', () => {
    const r = describeUsualPattern({ friction: 0.2, withdrawal: 0.7, sensitivity: 0.4, somatic: 0 })
    // withdrawal (0.7 → bastante más) primero, luego sensitivity (0.4 → más), luego friction (0.2 → algo de)
    expect(r).toBe('bastante más retiro o distancia, más sensibilidad emocional y algo de fricción o irritabilidad')
  })

  it('sin porcentajes crudos en la salida', () => {
    const r = describeUsualPattern({ friction: 0.74, withdrawal: 0.31, sensitivity: 0.1, somatic: 0.9 })
    expect(r).not.toMatch(/%|\d/)
  })

  it('dos señales usan "y" sin coma', () => {
    const r = describeUsualPattern({ friction: 0.3, withdrawal: 0.5, sensitivity: 0, somatic: 0 })
    expect(r).toBe('más retiro o distancia y más fricción o irritabilidad')
  })
})
