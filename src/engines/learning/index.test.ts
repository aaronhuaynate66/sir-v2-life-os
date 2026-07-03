// SIR V2 — Tests del feedback loop (A8).

import { describe, it, expect } from 'vitest'
import { computeEffectiveness, outcomePeace, adjustByLearning, type FeedbackEvent, type PeacePoint } from './index'

const peace: PeacePoint[] = [
  { date: '2026-07-01', value: 5 },
  { date: '2026-07-05', value: 8 }, // +3 respecto al 01
  { date: '2026-07-09', value: 4 },
]

describe('outcomePeace', () => {
  it('toma el primer snapshot >= at + 3 días', () => {
    expect(outcomePeace('2026-07-01T10:00:00Z', peace)).toBe(8) // 04+ → primer punto es 05
  })
  it('null si el outcome aún no llegó (evento reciente)', () => {
    expect(outcomePeace('2026-07-09T10:00:00Z', peace)).toBeNull()
  })
})

describe('computeEffectiveness', () => {
  it('mide delta por tipo (before → paz N días después)', () => {
    const events: FeedbackEvent[] = [
      { type: 'rest', domain: 'health', peaceBefore: 5, at: '2026-07-01T10:00:00Z' }, // after 8 → +3
      { type: 'rest', domain: 'health', peaceBefore: 6, at: '2026-07-02T10:00:00Z' }, // after 8 → +2
      { type: 'connect', domain: 'relational', peaceBefore: 8, at: '2026-07-06T10:00:00Z' }, // after 4 → -4
      { type: 'connect', domain: 'relational', peaceBefore: 7, at: '2026-07-05T10:00:00Z' }, // after 4 → -3
    ]
    const eff = computeEffectiveness(events, peace)
    const rest = eff.find((e) => e.type === 'rest')
    const connect = eff.find((e) => e.type === 'connect')
    expect(rest?.avgDelta).toBe(2.5) // (3+2)/2
    expect(rest?.verdict).toBe('helps')
    expect(connect?.avgDelta).toBe(-3.5) // (-4-3)/2
    expect(connect?.verdict).toBe('hurts')
    // ordenado: lo que más ayuda primero
    expect(eff[0].type).toBe('rest')
  })

  it('ignora eventos sin outcome todavía', () => {
    const events: FeedbackEvent[] = [{ type: 'rest', domain: 'health', peaceBefore: 5, at: '2026-07-09T10:00:00Z' }]
    expect(computeEffectiveness(events, peace)).toEqual([])
  })

  it('con 1 solo evento → insufficient', () => {
    const events: FeedbackEvent[] = [{ type: 'rest', domain: 'health', peaceBefore: 5, at: '2026-07-01T10:00:00Z' }]
    expect(computeEffectiveness(events, peace)[0].verdict).toBe('insufficient')
  })
})

describe('adjustByLearning', () => {
  const eff = [
    { type: 'rest', avgDelta: 2, n: 5, confidence: 'medium' as const, verdict: 'helps' as const },
    { type: 'connect', avgDelta: -2, n: 5, confidence: 'medium' as const, verdict: 'hurts' as const },
  ]
  it('sube la confianza de lo que ayuda, baja la de lo que no', () => {
    const recs = [{ type: 'rest', confidence: 0.6 }, { type: 'connect', confidence: 0.6 }, { type: 'action', confidence: 0.6 }]
    const out = adjustByLearning(recs, eff)
    expect(out[0].confidence).toBeGreaterThan(0.6) // rest ayuda
    expect(out[1].confidence).toBeLessThan(0.6)    // connect no
    expect(out[2].confidence).toBe(0.6)            // action sin dato → intacto
  })
  it('clampa a 0..1 y no muta el input', () => {
    const recs = [{ type: 'rest', confidence: 0.95 }]
    const copy = [...recs]
    const out = adjustByLearning(recs, eff)
    expect(out[0].confidence).toBeLessThanOrEqual(1)
    expect(recs).toEqual(copy)
  })
})
