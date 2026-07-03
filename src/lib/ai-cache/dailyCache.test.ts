// SIR V2 — Tests de la capa PURA del cache diaria de IA (V2).
// Sólo cubrimos las funciones deterministas (hash / key). La red (read/write)
// es fail-open y se prueba en integración; acá no la mockeamos.

import { describe, it, expect } from 'vitest'
import { shortHash, normalizeForKey, decisionCacheKey } from './dailyCache'

describe('shortHash', () => {
  it('es determinístico', () => {
    expect(shortHash('hola')).toBe(shortHash('hola'))
  })
  it('distingue textos distintos', () => {
    expect(shortHash('mudarme con el perro')).not.toBe(shortHash('pedir aumento'))
  })
  it('devuelve un string base36 no vacío', () => {
    expect(shortHash('x')).toMatch(/^[0-9a-z]+$/)
  })
  it('el vacío no explota', () => {
    expect(typeof shortHash('')).toBe('string')
  })
})

describe('normalizeForKey', () => {
  it('colapsa espacios y baja a minúsculas', () => {
    expect(normalizeForKey('  Pedir   AUMENTO  ')).toBe('pedir aumento')
  })
  it('variaciones triviales comparten normalización', () => {
    expect(normalizeForKey('Mudarme\ncon el perro')).toBe(normalizeForKey('mudarme con el perro'))
  })
})

describe('decisionCacheKey', () => {
  it('mismo día + misma decisión → misma key', () => {
    const a = decisionCacheKey('2026-07-03', 'Pedir aumento', 'con Alex y Cristina')
    const b = decisionCacheKey('2026-07-03', '  pedir  aumento ', 'CON ALEX Y CRISTINA')
    expect(a).toBe(b)
  })
  it('decisiones distintas el mismo día → keys distintas', () => {
    const a = decisionCacheKey('2026-07-03', 'Pedir aumento', '')
    const b = decisionCacheKey('2026-07-03', 'Mudarme con el perro', '')
    expect(a).not.toBe(b)
  })
  it('misma decisión otro día → otra key', () => {
    const a = decisionCacheKey('2026-07-03', 'Pedir aumento', '')
    const b = decisionCacheKey('2026-07-04', 'Pedir aumento', '')
    expect(a).not.toBe(b)
  })
  it('la key arranca con el día (bucket legible)', () => {
    expect(decisionCacheKey('2026-07-03', 'x', 'y')).toMatch(/^2026-07-03:/)
  })
})
