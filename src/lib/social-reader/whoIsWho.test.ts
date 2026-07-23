import { describe, it, expect } from 'vitest'
import { parseWhoIsWhoReply, handlesInReply, buildWhoIsWhoQuestion, handleToProbableName } from './whoIsWho'

describe('handleToProbableName', () => {
  it('separa por _ . - y quita dígitos', () => {
    expect(handleToProbableName('samuel_effendi_rodriguez')).toBe('Samuel Effendi Rodriguez')
    expect(handleToProbableName('raquel.2flores')).toBe('Raquel Flores')
    expect(handleToProbableName('@erikasaavedra_')).toBe('Erikasaavedra')
    expect(handleToProbableName('ajauregui195')).toBe('Ajauregui')
  })
})

describe('parseWhoIsWhoReply', () => {
  it('parsea "@handle Nombre Apellido"', () => {
    expect(parseWhoIsWhoReply('@juanaia_ Juana Iamota')).toEqual([{ handle: 'juanaia_', name: 'Juana Iamota' }])
  })
  it('varias líneas + descarte + "="', () => {
    const r = parseWhoIsWhoReply('@erikasaavedra_ = Erika Saavedra\n@ecoflow_market_peru no\n@raquel.2flores Raquel Flores')
    expect(r).toEqual([
      { handle: 'erikasaavedra_', name: 'Erika Saavedra' },
      { handle: 'ecoflow_market_peru', name: null },
      { handle: 'raquel.2flores', name: 'Raquel Flores' },
    ])
  })
  it('canoniza el handle (sin @, minúsculas) y dedup', () => {
    const r = parseWhoIsWhoReply('@Juan Pedro\n@juan otra vez')
    expect(r).toHaveLength(1)
    expect(r[0].handle).toBe('juan')
  })
  it('"@handle" solo o "ok" → ACEPTA el pálpito (nombre predicho)', () => {
    expect(parseWhoIsWhoReply('@samuel_effendi_rodriguez')).toEqual([{ handle: 'samuel_effendi_rodriguez', name: 'Samuel Effendi Rodriguez' }])
    expect(parseWhoIsWhoReply('@raquel.2flores ok')).toEqual([{ handle: 'raquel.2flores', name: 'Raquel Flores' }])
  })
  it('"@handle no" → descartar (name null)', () => {
    expect(parseWhoIsWhoReply('@corporacionaxion no')).toEqual([{ handle: 'corporacionaxion', name: null }])
  })
  it('texto sin handles → vacío', () => {
    expect(parseWhoIsWhoReply('hola, cómo estás?')).toEqual([])
  })
})

describe('handlesInReply', () => {
  it('lista los handles mencionados', () => {
    expect(handlesInReply('@a Juan @b no')).toEqual(['a', 'b'])
  })
})

describe('buildWhoIsWhoQuestion', () => {
  it('lista los handles con pálpito de nombre y explica el formato', () => {
    const q = buildWhoIsWhoQuestion(['samuel_effendi_rodriguez', 'erikasaavedra_'])
    expect(q).toContain('@samuel_effendi_rodriguez')
    expect(q).toContain('¿Samuel Effendi Rodriguez?') // pálpito
    expect(q).toMatch(/@handle Nombre/i)
    expect(q).toMatch(/@handle no/i)
  })
  it('cap a 8 handles', () => {
    const q = buildWhoIsWhoQuestion(Array.from({ length: 12 }, (_, i) => `h${i}`))
    expect((q.match(/· @/g) ?? []).length).toBe(8)
  })
})
