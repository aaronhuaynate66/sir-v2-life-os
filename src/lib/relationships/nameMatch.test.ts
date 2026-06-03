import { describe, it, expect } from 'vitest'

import { normalizeName, nameTokens, matchStrength, isLikelySameName } from './nameMatch'

describe('normalizeName', () => {
  it('strips diacritics, case and punctuation', () => {
    expect(normalizeName('María Isabel Espinoza Vidaurre')).toBe('maria isabel espinoza vidaurre')
    expect(normalizeName('  José-Luis  ')).toBe('jose luis')
  })
})

describe('nameTokens', () => {
  it('splits normalized tokens', () => {
    expect(nameTokens('María Isabel')).toEqual(['maria', 'isabel'])
    expect(nameTokens('')).toEqual([])
  })
})

describe('matchStrength', () => {
  it('exact normalized match is 1', () => {
    expect(matchStrength('maria isabel', 'María Isabel')).toBe(1)
  })

  it('the core case: "maria" matches "María Isabel Espinoza Vidaurre"', () => {
    // primer nombre del candidato → 0.8 (umbral de reconciliación)
    expect(matchStrength('maria', 'María Isabel Espinoza Vidaurre')).toBeGreaterThanOrEqual(0.8)
    expect(isLikelySameName('maria', 'María Isabel Espinoza Vidaurre')).toBe(true)
  })

  it('all query tokens contained in candidate scores high', () => {
    expect(matchStrength('isabel maria', 'María Isabel Espinoza')).toBeGreaterThanOrEqual(0.9)
  })

  it('unrelated names score 0', () => {
    expect(matchStrength('maria', 'Pedro Gómez')).toBe(0)
  })

  it('empty inputs score 0', () => {
    expect(matchStrength('', 'María')).toBe(0)
    expect(matchStrength('maria', '')).toBe(0)
  })
})
