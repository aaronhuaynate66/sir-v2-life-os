import { describe, it, expect } from 'vitest'
import { buildArquetipoInput, parseArquetipo } from './arquetipoPrompt'

describe('buildArquetipoInput', () => {
  it('incluye norte e hitos', () => {
    const out = buildArquetipoInput([{ label: 'Bronce Mundial', date: '2024-10-01', kind: 'event' }], 'Mundial de bomberos')
    expect(out).toContain('Mundial de bomberos')
    expect(out).toContain('Bronce Mundial')
  })
})

describe('parseArquetipo', () => {
  it('parsea JSON válido', () => {
    const r = parseArquetipo('ruido {"archetype":"El Héroe","tension":"El Protector","reflection":"x ¿es la historia que elegís?"} fin')
    expect(r?.archetype).toBe('El Héroe')
    expect(r?.tension).toBe('El Protector')
  })
  it('null si falta archetype o reflection', () => {
    expect(parseArquetipo('{"tension":"x"}')).toBeNull()
    expect(parseArquetipo('no json')).toBeNull()
  })
})
