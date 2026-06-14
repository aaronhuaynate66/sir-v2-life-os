import { describe, it, expect } from 'vitest'
import { findDuplicatePeople } from './duplicates'

describe('findDuplicatePeople', () => {
  it('agrupa mismo nombre con distinta grafía (acentos/casing)', () => {
    const g = findDuplicatePeople([
      { id: '1', name: 'Nicolle Huaynate Espinoza' },
      { id: '2', name: 'nicolle huaynate espinoza' },
      { id: '3', name: 'Francisco Benavides' },
    ])
    expect(g).toHaveLength(1)
    expect(g[0].map((p) => p.id).sort()).toEqual(['1', '2'])
  })

  it('agrupa por alias que coincide con el nombre de otra', () => {
    const g = findDuplicatePeople([
      { id: '1', name: 'Papá', alias: 'Fernando Brañes' },
      { id: '2', name: 'Fernando Brañes' },
    ])
    expect(g).toHaveLength(1)
    expect(g[0]).toHaveLength(2)
  })

  it('no agrupa personas distintas', () => {
    const g = findDuplicatePeople([
      { id: '1', name: 'Ana' },
      { id: '2', name: 'Beto' },
      { id: '3', name: 'Carla' },
    ])
    expect(g).toHaveLength(0)
  })

  it('ignora nombres demasiado cortos como clave', () => {
    const g = findDuplicatePeople([
      { id: '1', name: 'A' },
      { id: '2', name: 'A' },
    ])
    expect(g).toHaveLength(0)
  })
})
