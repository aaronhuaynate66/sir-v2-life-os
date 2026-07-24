import { describe, it, expect } from 'vitest'
import { buildMemoryFtsQuery } from './hybridRecall'

describe('buildMemoryFtsQuery', () => {
  it('une términos salientes con OR', () => {
    const q = buildMemoryFtsQuery('¿qué pasó con la cotización de Marlab?')
    // "cotizacion", "marlab" son los salientes (sin tildes, ≥4 chars, sin stopwords)
    expect(q).toContain(' or ')
    expect(q).toContain('cotizacion')
    expect(q).toContain('marlab')
  })

  it('devuelve "" para query trivial (solo stopwords/cortas)', () => {
    expect(buildMemoryFtsQuery('que como y por')).toBe('')
    expect(buildMemoryFtsQuery('')).toBe('')
  })

  it('normaliza tildes (matchea el índice to_tsvector sin acentos duplicados)', () => {
    const q = buildMemoryFtsQuery('el préstamo del terreno')
    expect(q).toContain('prestamo')
    expect(q).toContain('terreno')
    expect(q).not.toMatch(/[áéíóú]/)
  })

  it('no incluye separador si hay un solo término', () => {
    const q = buildMemoryFtsQuery('Boticas')
    expect(q).toBe('boticas')
    expect(q).not.toContain(' or ')
  })
})
