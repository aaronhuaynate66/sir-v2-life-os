import { describe, it, expect } from 'vitest'
import { parseWhoIsWhoReply, handlesInReply, buildWhoIsWhoQuestion } from './whoIsWho'

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
  it('handle sin nombre → descartar (name null)', () => {
    expect(parseWhoIsWhoReply('@solo')).toEqual([{ handle: 'solo', name: null }])
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
  it('lista los handles y explica el formato', () => {
    const q = buildWhoIsWhoQuestion(['juanaia_', 'erikasaavedra_'])
    expect(q).toContain('@juanaia_')
    expect(q).toContain('@erikasaavedra_')
    expect(q).toMatch(/@handle Nombre/i)
  })
  it('cap a 8 handles', () => {
    const q = buildWhoIsWhoQuestion(Array.from({ length: 12 }, (_, i) => `h${i}`))
    expect((q.match(/· @/g) ?? []).length).toBe(8)
  })
})
