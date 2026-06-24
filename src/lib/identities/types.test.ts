import { describe, it, expect } from 'vitest'
import { normIdentifier, isNetwork, mapIdentityRow } from './types'

describe('normIdentifier', () => {
  it('iguala mayúsculas, acentos y símbolos', () => {
    expect(normIdentifier('Papá')).toBe('papa')
    expect(normIdentifier('  PAPA ')).toBe('papa')
    expect(normIdentifier('@Nick.Name')).toBe('nick name')
  })
  it('conserva + del teléfono', () => {
    expect(normIdentifier('+51 999')).toBe('+51 999')
  })
  it('vacío seguro', () => {
    expect(normIdentifier('')).toBe('')
  })
})

describe('isNetwork', () => {
  it('valida redes conocidas', () => {
    expect(isNetwork('whatsapp')).toBe(true)
    expect(isNetwork('myspace')).toBe(false)
  })
})

describe('mapIdentityRow', () => {
  it('cae a other si la red es desconocida', () => {
    expect(mapIdentityRow({ id: 'a', person_id: 'p', network: 'zzz', identifier: 'x' }).network).toBe('other')
  })
})
