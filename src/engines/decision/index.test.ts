// SIR V2 — Tests del evaluador de decisiones (A4).

import { describe, it, expect } from 'vitest'
import { evaluateDecision, DECISION_DIMENSIONS } from './index'

describe('evaluateDecision', () => {
  it('devuelve las 8 dimensiones; las no provistas quedan no-evaluadas', () => {
    const a = evaluateDecision({ title: 'X', scores: { peace: { score: 1 } } })
    expect(a.dimensions).toHaveLength(8)
    expect(a.dimensions.map((d) => d.dimension)).toEqual(DECISION_DIMENSIONS)
    expect(a.dimensions.find((d) => d.dimension === 'peace')?.evaluated).toBe(true)
    expect(a.dimensions.find((d) => d.dimension === 'timing')?.evaluated).toBe(false)
  })

  it('positivo y claro → go', () => {
    const a = evaluateDecision({ title: 'X', scores: {
      peace: { score: 2 }, biological: { score: 1 }, financial: { score: 1 }, alignment: { score: 2 }, reversibility: { score: 2 },
    } })
    expect(a.verdict).toBe('go')
    expect(a.weighted).toBeGreaterThan(0.7)
  })

  it('negativo → hold', () => {
    const a = evaluateDecision({ title: 'X', scores: { peace: { score: -2 }, financial: { score: -1 } } })
    expect(a.verdict).toBe('hold')
    expect(a.topRisk?.dimension).toBe('peace')
  })

  it('gate de reversibilidad: bueno PERO irreversible y no clarísimo → no es go', () => {
    // weighted ~0.8 (bueno) pero reversibilidad -2 (irreversible) → cae a caution/hold
    const a = evaluateDecision({ title: 'X', scores: {
      peace: { score: 1 }, alignment: { score: 1 }, reversibility: { score: -2 },
    } })
    expect(a.verdict).not.toBe('go')
  })

  it('irreversible pero MUY positivo (weighted>=1.2) → sí go', () => {
    const a = evaluateDecision({ title: 'X', scores: {
      peace: { score: 2 }, biological: { score: 2 }, financial: { score: 2 }, alignment: { score: 2 }, reversibility: { score: -2 },
    } })
    expect(a.verdict).toBe('go')
  })

  it('los valores pesan fuerte: traicionarlos arrastra el ponderado', () => {
    // values -2 (peso 5) vs relacional +2 (peso 2) → ponderado negativo
    const a = evaluateDecision({ title: 'X', scores: { values: { score: -2 }, relational: { score: 2 } } })
    expect(a.weighted).toBeLessThan(0)
    expect(a.topRisk?.dimension).toBe('values')
  })

  it('la paz pesa más que lo relacional (jerarquía A3)', () => {
    // paz -2 (peso 6) vs relacional +2 (peso 2) → ponderado negativo
    const a = evaluateDecision({ title: 'X', scores: { peace: { score: -2 }, relational: { score: 2 } } })
    expect(a.weighted).toBeLessThan(0)
  })

  it('sin dimensiones ponderables evaluadas → weighted 0, caution', () => {
    const a = evaluateDecision({ title: 'X', scores: { reversibility: { score: 2 } } })
    expect(a.weighted).toBe(0)
    expect(a.verdict).toBe('caution')
    expect(a.topRisk).toBeNull()
  })
})
