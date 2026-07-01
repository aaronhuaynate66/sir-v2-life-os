import { describe, expect, it } from 'vitest'

import { buildAdjacency, diffuse, topActivated } from './diffuse'
import { BASE_WEIGHT, edgeKey, nodeKey } from './types'
import type { Graph, TypedEdge } from './types'

// Helper para construir un grafo mock rapido.
function mkGraph(edges: Array<Partial<TypedEdge> & { srcType: TypedEdge['srcType']; srcId: string; dstType: TypedEdge['dstType']; dstId: string; kind: TypedEdge['kind']; weight: number }>): Graph {
  const nodes = new Set<string>()
  const built: TypedEdge[] = edges.map((e) => {
    nodes.add(nodeKey(e.srcType, e.srcId))
    nodes.add(nodeKey(e.dstType, e.dstId))
    return {
      key: edgeKey(e.srcType, e.srcId, e.dstType, e.dstId, e.kind),
      srcType: e.srcType,
      srcId: e.srcId,
      dstType: e.dstType,
      dstId: e.dstId,
      kind: e.kind,
      derivedWeight: BASE_WEIGHT[e.kind],
      learnedWeight: 0,
      weight: e.weight,
    }
  })
  return {
    edges: built,
    nodes: [...nodes].map((k) => {
      const [type, id] = k.split(':') as [TypedEdge['srcType'], string]
      return { type, id, label: id }
    }),
  }
}

describe('brain/diffuse · buildAdjacency', () => {
  it('trata las aristas como no dirigidas', () => {
    const g = mkGraph([
      { srcType: 'person', srcId: 'a', dstType: 'person', dstId: 'b', kind: 'family', weight: 8 },
    ])
    const adj = buildAdjacency(g.edges)
    expect(adj.get('person:a')?.[0]?.neighbor).toBe('person:b')
    expect(adj.get('person:b')?.[0]?.neighbor).toBe('person:a')
  })

  it('agrega pesos cuando el mismo par aparece por multiples aristas', () => {
    const g = mkGraph([
      { srcType: 'deal', srcId: 'd1', dstType: 'person', dstId: 'p1', kind: 'deal_contact', weight: 7 },
      { srcType: 'deal', srcId: 'd1', dstType: 'person', dstId: 'p1', kind: 'deal_related', weight: 3 },
    ])
    const adj = buildAdjacency(g.edges)
    expect(adj.get('deal:d1')?.[0]?.weight).toBe(10)
  })

  it('ignora self-loops', () => {
    const g = mkGraph([
      { srcType: 'person', srcId: 'x', dstType: 'person', dstId: 'x', kind: 'memory_person', weight: 2 },
    ])
    const adj = buildAdjacency(g.edges)
    expect(adj.size).toBe(0)
  })

  it('ignora aristas con peso 0', () => {
    const g = mkGraph([
      { srcType: 'person', srcId: 'a', dstType: 'person', dstId: 'b', kind: 'family', weight: 0 },
    ])
    const adj = buildAdjacency(g.edges)
    expect(adj.size).toBe(0)
  })
})

describe('brain/diffuse · diffuse', () => {
  it('seed sin vecinos: solo se activa el seed', () => {
    const g: Graph = { nodes: [], edges: [] }
    const act = diffuse(g, 'goal:solo')
    expect(act.get('goal:solo')).toBe(100)
    expect(act.size).toBe(1)
  })

  it('un vecino recibe energia * (1) * decay', () => {
    const g = mkGraph([
      { srcType: 'goal', srcId: 'g1', dstType: 'step', dstId: 's1', kind: 'goal_step', weight: 5 },
    ])
    const act = diffuse(g, 'goal:g1', { decayPerHop: 0.5, maxHops: 1 })
    // Energia 100 * (5/5) * 0.5 = 50
    expect(act.get('step:s1')).toBe(50)
    expect(act.get('goal:g1')).toBe(100)
  })

  it('multiples vecinos: la energia se divide por peso', () => {
    const g = mkGraph([
      { srcType: 'goal', srcId: 'g1', dstType: 'step', dstId: 's1', kind: 'goal_step', weight: 8 },
      { srcType: 'goal', srcId: 'g1', dstType: 'step', dstId: 's2', kind: 'goal_step', weight: 2 },
    ])
    const act = diffuse(g, 'goal:g1', { decayPerHop: 1.0, maxHops: 1 })
    // total = 10, s1 recibe 100 * 8/10 * 1 = 80, s2 recibe 100 * 2/10 * 1 = 20
    expect(act.get('step:s1')).toBe(80)
    expect(act.get('step:s2')).toBe(20)
  })

  it('respeta maxHops', () => {
    // Cadena a → b → c → d
    const g = mkGraph([
      { srcType: 'person', srcId: 'a', dstType: 'person', dstId: 'b', kind: 'family', weight: 5 },
      { srcType: 'person', srcId: 'b', dstType: 'person', dstId: 'c', kind: 'family', weight: 5 },
      { srcType: 'person', srcId: 'c', dstType: 'person', dstId: 'd', kind: 'family', weight: 5 },
    ])
    const act1 = diffuse(g, 'person:a', { maxHops: 1, decayPerHop: 1, minActivation: 0 })
    expect(act1.has('person:b')).toBe(true)
    expect(act1.has('person:c')).toBe(false)
    expect(act1.has('person:d')).toBe(false)

    const act3 = diffuse(g, 'person:a', { maxHops: 3, decayPerHop: 1, minActivation: 0 })
    expect(act3.has('person:d')).toBe(true)
  })

  it('minActivation corta shares diminutos', () => {
    const g = mkGraph([
      { srcType: 'goal', srcId: 'g1', dstType: 'person', dstId: 'p1', kind: 'deal_contact', weight: 100 },
      { srcType: 'goal', srcId: 'g1', dstType: 'person', dstId: 'p2', kind: 'deal_contact', weight: 0.001 },
    ])
    // p2 recibiria un share microscopico, se descarta.
    const act = diffuse(g, 'goal:g1', { decayPerHop: 1, maxHops: 1, minActivation: 1 })
    expect(act.has('person:p1')).toBe(true)
    expect(act.has('person:p2')).toBe(false)
  })

  it('multiples caminos al mismo destino suman activacion', () => {
    // seed → a → target, seed → b → target
    const g = mkGraph([
      { srcType: 'goal', srcId: 'seed', dstType: 'person', dstId: 'a', kind: 'deal_contact', weight: 5 },
      { srcType: 'goal', srcId: 'seed', dstType: 'person', dstId: 'b', kind: 'deal_contact', weight: 5 },
      { srcType: 'person', srcId: 'a', dstType: 'person', dstId: 'target', kind: 'family', weight: 5 },
      { srcType: 'person', srcId: 'b', dstType: 'person', dstId: 'target', kind: 'family', weight: 5 },
    ])
    const act = diffuse(g, 'goal:seed', { maxHops: 2, decayPerHop: 1, minActivation: 0 })
    // Hop1: a=50, b=50. Hop2 desde a: solo tiene target (excepto vuelta a seed).
    // a → target: total=10 (target 5 + seed 5); target recibe 50 * 5/10 = 25.
    // Igual desde b: target recibe otros 25.
    // Total target = 50.
    expect(act.get('person:target')).toBe(50)
  })

  it('es deterministico entre ejecuciones', () => {
    const g = mkGraph([
      { srcType: 'goal', srcId: 'g', dstType: 'person', dstId: 'x', kind: 'deal_contact', weight: 7 },
      { srcType: 'goal', srcId: 'g', dstType: 'person', dstId: 'y', kind: 'deal_contact', weight: 3 },
    ])
    const a = diffuse(g, 'goal:g')
    const b = diffuse(g, 'goal:g')
    expect([...a.entries()]).toEqual([...b.entries()])
  })

  it('no diverge en un ciclo', () => {
    // Triangulo con retroceso; sin maxHops divergiria. Con maxHops=3 debe terminar.
    const g = mkGraph([
      { srcType: 'person', srcId: 'a', dstType: 'person', dstId: 'b', kind: 'family', weight: 5 },
      { srcType: 'person', srcId: 'b', dstType: 'person', dstId: 'c', kind: 'family', weight: 5 },
      { srcType: 'person', srcId: 'c', dstType: 'person', dstId: 'a', kind: 'family', weight: 5 },
    ])
    const act = diffuse(g, 'person:a', { maxHops: 3 })
    // Todos deberian tener energia positiva pero finita.
    for (const v of act.values()) expect(Number.isFinite(v)).toBe(true)
    expect(act.get('person:a')).toBeGreaterThan(0)
    expect(act.get('person:b')).toBeGreaterThan(0)
    expect(act.get('person:c')).toBeGreaterThan(0)
  })
})

describe('brain/diffuse · topActivated', () => {
  it('excluye el seed y devuelve top-N ordenado desc', () => {
    const act = new Map<string, number>([
      ['seed', 100],
      ['a', 50],
      ['b', 30],
      ['c', 80],
    ])
    const top = topActivated(act, 'seed', 2)
    expect(top).toEqual([
      { nodeKey: 'c', activation: 80 },
      { nodeKey: 'a', activation: 50 },
    ])
  })

  it('desempata estable por nodeKey', () => {
    const act = new Map<string, number>([
      ['seed', 100],
      ['b', 10],
      ['a', 10],
    ])
    const top = topActivated(act, 'seed', 2)
    expect(top[0].nodeKey).toBe('a')
    expect(top[1].nodeKey).toBe('b')
  })

  it('respeta limit', () => {
    const act = new Map<string, number>(
      Array.from({ length: 10 }, (_, i) => [`n${i}`, i * 5]),
    )
    const top = topActivated(act, 'unused', 3)
    expect(top).toHaveLength(3)
  })
})
