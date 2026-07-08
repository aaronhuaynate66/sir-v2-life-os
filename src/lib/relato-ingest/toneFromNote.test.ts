import { describe, it, expect } from 'vitest'

import { buildToneBatchPrompt, parseToneBatch } from './toneFromNote'

describe('buildToneBatchPrompt', () => {
  it('numera y aplana las notas', () => {
    const out = buildToneBatchPrompt(['buena  charla', 'me\nmolestó'])
    expect(out).toBe('1. buena charla\n2. me molestó')
  })
})

describe('parseToneBatch', () => {
  it('parsea un array limpio del largo esperado', () => {
    expect(parseToneBatch('[4, 2, 3]', 3)).toEqual([4, 2, 3])
  })

  it('extrae el array aunque venga con texto alrededor', () => {
    expect(parseToneBatch('Acá va: [5,1]. listo', 2)).toEqual([5, 1])
  })

  it('null si la cantidad no coincide (no aplicamos parcial)', () => {
    expect(parseToneBatch('[4, 2]', 3)).toBeNull()
  })

  it('null si algún valor cae fuera de 1-5 (no aplicamos basura)', () => {
    expect(parseToneBatch('[4, 9, 3]', 3)).toBeNull()
    expect(parseToneBatch('[0, 2, 3]', 3)).toBeNull()
  })

  it('null si no hay array', () => {
    expect(parseToneBatch('no pude', 2)).toBeNull()
  })

  it('redondea decimales al entero', () => {
    expect(parseToneBatch('[3.9, 1.2]', 2)).toEqual([4, 1])
  })
})
