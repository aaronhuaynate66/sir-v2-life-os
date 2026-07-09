// SIR V2 — Tests del DTO de lecciones.

import { describe, it, expect } from 'vitest'
import { learningRowToDto, normalizeLearningKind, normalizeLearningConfidence } from './types'

describe('learningRowToDto', () => {
  it('mapea + trim + defaults', () => {
    const d = learningRowToDto({ id: 'a', text: '  Aaron prioriza el Mundial ', kind: 'principle', source: 'relato', confidence: 'high', is_active: true, reinforced_count: 3, created_at: '2026-07-08' })
    expect(d).toEqual({ id: 'a', text: 'Aaron prioriza el Mundial', kind: 'principle', source: 'relato', confidence: 'high', isActive: true, reinforcedCount: 3, createdAt: '2026-07-08' })
  })
  it('valores raros → defaults seguros', () => {
    const d = learningRowToDto({ id: 'b', text: 'x', kind: 'garbage', source: null, confidence: 'weird', is_active: null, reinforced_count: 0, created_at: null })
    expect(d.kind).toBe('pattern')
    expect(d.confidence).toBe('medium')
    expect(d.isActive).toBe(true)
    expect(d.reinforcedCount).toBe(1) // piso 1
    expect(d.source).toBe('relato')
  })
})

describe('normalizeLearningKind / Confidence', () => {
  it('acepta válidos, cae a default el resto', () => {
    expect(normalizeLearningKind('fact')).toBe('fact')
    expect(normalizeLearningKind('nope')).toBe('pattern')
    expect(normalizeLearningConfidence('low')).toBe('low')
    expect(normalizeLearningConfidence(42)).toBe('medium')
  })
})
