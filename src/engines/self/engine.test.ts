// SIR V2 — Tests del Self Engine (lógica pura de scoring + detección).
//
// calculateSelfCoherence: suma/resta puntos por presencia de valores,
// misión, motivadores y exceso de creencias limitantes, con clamp [0,10].
// analyzeSelfPatterns: promedia métricas por categoría y dispara patrones
// sólo con ≥3 lecturas y umbral (energía<4, estrés>7). Ambos puros.

import { describe, it, expect } from 'vitest'

import type { SelfMetric } from '@/types'
import type { SelfProfile } from './types'
import { calculateSelfCoherence, analyzeSelfPatterns } from './engine'

function profile(overrides: Partial<SelfProfile> = {}): SelfProfile {
  return {
    id: 'self_1',
    name: 'Test',
    age: 30,
    mission: '',
    coreValues: [],
    coreBeliefs: [],
    limitingBeliefs: [],
    decisionStyle: 'analytic',
    conflictStyle: 'collaborating',
    attachmentStyle: 'secure',
    motivators: [],
    stressors: [],
    defenseMechanisms: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

let n = 0
function metric(category: SelfMetric['category'], value: number): SelfMetric {
  return { id: `sm_${n++}`, category, value, timestamp: '2026-01-01T00:00:00.000Z' }
}

describe('calculateSelfCoherence', () => {
  it('perfil vacío → score base 5', () => {
    expect(calculateSelfCoherence(profile())).toBe(5)
  })

  it('suma por valores core, misión >10 chars y motivadores', () => {
    const r = calculateSelfCoherence(
      profile({
        coreValues: ['integridad'],
        mission: 'Construir algo que perdure', // >10 chars
        motivators: ['autonomía'],
      }),
    )
    expect(r).toBe(8) // 5 +1 +1 +1
  })

  it('misión de ≤10 chars NO suma', () => {
    expect(calculateSelfCoherence(profile({ mission: 'corta' }))).toBe(5)
    expect(calculateSelfCoherence(profile({ mission: '1234567890' }))).toBe(5) // exactamente 10
    expect(calculateSelfCoherence(profile({ mission: '12345678901' }))).toBe(6) // 11
  })

  it('>3 creencias limitantes restan 1', () => {
    expect(calculateSelfCoherence(profile({ limitingBeliefs: ['a', 'b', 'c'] }))).toBe(5) // 3, no resta
    expect(calculateSelfCoherence(profile({ limitingBeliefs: ['a', 'b', 'c', 'd'] }))).toBe(4) // 4 → -1
  })

  it('CLAMP inferior a 0: muchas creencias limitantes sin nada que sume', () => {
    const r = calculateSelfCoherence(profile({ limitingBeliefs: ['a', 'b', 'c', 'd'] }))
    expect(r).toBeGreaterThanOrEqual(0)
  })

  it('CLAMP superior a 10: todo presente nunca supera 10', () => {
    const r = calculateSelfCoherence(
      profile({
        coreValues: ['v'],
        mission: 'una misión bien larga y clara',
        motivators: ['m'],
        limitingBeliefs: [], // no resta
      }),
    )
    expect(r).toBe(8)
    expect(r).toBeLessThanOrEqual(10)
  })
})

describe('analyzeSelfPatterns', () => {
  it('menos de 3 métricas → sin patrones', () => {
    expect(analyzeSelfPatterns([metric('energy', 2), metric('energy', 2)])).toEqual([])
  })

  it('energía promedio < 4 con ≥3 lecturas → patrón de energía baja', () => {
    const p = analyzeSelfPatterns([metric('energy', 3), metric('energy', 2), metric('energy', 3)])
    expect(p).toHaveLength(1)
    expect(p[0].id).toBe('low-energy-pattern')
    expect(p[0].isPositive).toBe(false)
  })

  it('energía promedio ≥ 4 → NO dispara (umbral)', () => {
    const p = analyzeSelfPatterns([metric('energy', 4), metric('energy', 4), metric('energy', 4)])
    expect(p).toHaveLength(0)
  })

  it('estrés promedio > 7 con ≥3 lecturas → patrón de estrés alto', () => {
    const p = analyzeSelfPatterns([metric('stress', 8), metric('stress', 8), metric('stress', 8)])
    expect(p).toHaveLength(1)
    expect(p[0].id).toBe('high-stress-pattern')
  })

  it('estrés promedio = 7 NO dispara (umbral estricto >7)', () => {
    const p = analyzeSelfPatterns([metric('stress', 7), metric('stress', 7), metric('stress', 7)])
    expect(p).toHaveLength(0)
  })

  it('necesita ≥3 lecturas POR categoría, no en total', () => {
    // 4 métricas totales pero sólo 2 de energía → no dispara energía.
    const p = analyzeSelfPatterns([
      metric('energy', 1),
      metric('energy', 1),
      metric('mood', 5),
      metric('focus', 5),
    ])
    expect(p).toHaveLength(0)
  })
})
