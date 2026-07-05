// SIR V2 — Tests 15·7: inteligencia de red (caminos + presentaciones).

import { describe, it, expect } from 'vitest'
import { findBridges, suggestIntroductions, type NetEdge, type NetPerson } from './network'

const people: NetPerson[] = [
  { id: 'x', name: 'Ximena Objetivo', importance: 3, organization: 'ACME' },
  { id: 'y', name: 'Yago Puente', importance: 8, organization: 'ACME' },
  { id: 'z', name: 'Zoe Puente', importance: 5, organization: 'Otra' },
  { id: 'w', name: 'Walter Suelto', importance: 6, organization: 'ACME' },
]
const byId = new Map(people.map((p) => [p.id, p]))

describe('findBridges', () => {
  it('encuentra mutuos que conectan con el objetivo, rankeados por fuerza', () => {
    const edges: NetEdge[] = [
      { aId: 'x', bId: 'y', weight: 2 }, // Yago conoce a Ximena (arista con peso)
      { aId: 'z', bId: 'x', weight: null }, // Zoe conoce a Ximena
    ]
    const b = findBridges(edges, byId, 'x')
    expect(b.map((x) => x.viaId)).toEqual(['y', 'z']) // Yago (8+2=10) > Zoe (5+0=5)
    expect(b[0].strength).toBe(10)
    expect(b[0].edgeWeight).toBe(2)
  })

  it('excluye al self y al propio objetivo; vacío si no hay aristas', () => {
    const edges: NetEdge[] = [{ aId: 'self', bId: 'x' }]
    expect(findBridges(edges, byId, 'x')).toHaveLength(0)
    expect(findBridges([], byId, 'x')).toHaveLength(0)
  })

  it('respeta el límite', () => {
    const edges: NetEdge[] = [
      { aId: 'x', bId: 'y' }, { aId: 'x', bId: 'z' }, { aId: 'x', bId: 'w' },
    ]
    expect(findBridges(edges, byId, 'x', { limit: 2 })).toHaveLength(2)
  })
})

describe('suggestIntroductions', () => {
  it('propone intro entre dos personas del mismo org NO conectadas', () => {
    const edges: NetEdge[] = [] // nadie conectado
    const intros = suggestIntroductions(edges, people)
    // x, y, w están en ACME → pares (x,y),(x,w),(y,w). z está solo en "Otra".
    const keys = intros.map((i) => [i.aId, i.bId].sort().join('|'))
    expect(keys).toContain('w|y')
    expect(keys).toContain('x|y')
    expect(keys.some((k) => k.includes('z'))).toBe(false)
  })

  it('NO propone intro si ya están conectados', () => {
    const edges: NetEdge[] = [{ aId: 'x', bId: 'y' }]
    const intros = suggestIntroductions(edges, people)
    const keys = intros.map((i) => [i.aId, i.bId].sort().join('|'))
    expect(keys).not.toContain('x|y')
  })

  it('prioriza por importancia combinada', () => {
    const intros = suggestIntroductions([], people)
    // (y=8, w=6)=14 debería ir antes que (x=3, w=6)=9
    const first = [intros[0].aId, intros[0].bId].sort().join('|')
    expect(first).toBe('w|y')
  })

  it('sin organización → sin intros', () => {
    const noOrg = people.map((p) => ({ ...p, organization: null }))
    expect(suggestIntroductions([], noOrg)).toHaveLength(0)
  })
})
