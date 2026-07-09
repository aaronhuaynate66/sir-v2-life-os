// SIR V2 — Tests del recall de lecciones (Fase 3d). PURO.

import { describe, it, expect } from 'vitest'
import { renderLearningsBlock, sortLearnings, rowToLearning, type Learning } from './recall'

const L = (over: Partial<Learning>): Learning => ({
  text: over.text ?? 'Aaron prefiere findes largos', kind: over.kind ?? 'preference',
  confidence: over.confidence ?? 'medium', reinforcedCount: over.reinforcedCount ?? 1,
})

describe('rowToLearning', () => {
  it('mapea + defaults ante valores raros', () => {
    const l = rowToLearning({ text: '  x  ', kind: 'garbage', confidence: null, reinforced_count: null })
    expect(l.text).toBe('x')
    expect(l.kind).toBe('pattern') // fallback
    expect(l.confidence).toBe('medium')
    expect(l.reinforcedCount).toBe(1)
  })
})

describe('sortLearnings', () => {
  it('principios primero, luego más reforzado', () => {
    const out = sortLearnings([
      L({ text: 'pref', kind: 'preference', reinforcedCount: 9 }),
      L({ text: 'princ', kind: 'principle', reinforcedCount: 1 }),
      L({ text: 'pat-mucho', kind: 'pattern', reinforcedCount: 5 }),
      L({ text: 'pat-poco', kind: 'pattern', reinforcedCount: 1 }),
    ])
    expect(out[0].text).toBe('princ') // principle gana aunque tenga menos refuerzo
    expect(out[1].text).toBe('pat-mucho') // dentro de pattern, más reforzado primero
  })
})

describe('renderLearningsBlock', () => {
  it('vacío → ""', () => {
    expect(renderLearningsBlock([])).toBe('')
  })
  it('lista con etiqueta de tipo + header', () => {
    const b = renderLearningsBlock([L({ text: 'Aaron prioriza el Mundial', kind: 'principle' })])
    expect(b).toContain('APRENDISTE DE AARON')
    expect(b).toContain('[principio] Aaron prioriza el Mundial')
  })
  it('respeta el limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => L({ text: `l${i}` }))
    const b = renderLearningsBlock(many, 5)
    expect(b.split('\n').length).toBe(1 + 5) // header + 5
  })
  it('filtra textos vacíos', () => {
    expect(renderLearningsBlock([L({ text: '  ' })])).toBe('')
  })
})
