import { describe, expect, it } from 'vitest'

import { describeGlow, pickSeedForContext } from './surface'
import { BASE_WEIGHT, edgeKey, nodeKey, type Graph, type TypedEdge } from './types'

// Helper de grafo (mismo que en diffuse.test).
function mkGraph(
  nodes: Array<{ type: TypedEdge['srcType']; id: string; label?: string }>,
  edges: Array<Partial<TypedEdge> & { srcType: TypedEdge['srcType']; srcId: string; dstType: TypedEdge['dstType']; dstId: string; kind: TypedEdge['kind']; weight: number }>,
): Graph {
  return {
    nodes: nodes.map((n) => ({ type: n.type, id: n.id, label: n.label ?? n.id })),
    edges: edges.map((e) => ({
      key: edgeKey(e.srcType, e.srcId, e.dstType, e.dstId, e.kind),
      srcType: e.srcType,
      srcId: e.srcId,
      dstType: e.dstType,
      dstId: e.dstId,
      kind: e.kind,
      derivedWeight: BASE_WEIGHT[e.kind],
      learnedWeight: 0,
      weight: e.weight,
    })),
  }
}

describe('brain/surface · pickSeedForContext', () => {
  it('prefiere nextGoalId sobre anchorGoalId', () => {
    const g = mkGraph(
      [
        { type: 'goal', id: 'next' },
        { type: 'goal', id: 'anchor' },
      ],
      [],
    )
    const seed = pickSeedForContext({ nextGoalId: 'next', anchorGoalId: 'anchor' }, g)
    expect(seed).toBe('goal:next')
  })

  it('cae en anchorGoalId si nextGoalId no existe en el grafo', () => {
    const g = mkGraph([{ type: 'goal', id: 'anchor' }], [])
    const seed = pickSeedForContext({ nextGoalId: 'fantasma', anchorGoalId: 'anchor' }, g)
    expect(seed).toBe('goal:anchor')
  })

  it('cae al primer goal cuando nada del contexto existe', () => {
    const g = mkGraph(
      [
        { type: 'goal', id: 'g1' },
        { type: 'goal', id: 'g2' },
      ],
      [],
    )
    const seed = pickSeedForContext({}, g)
    expect(seed).toBe('goal:g1')
  })

  it('devuelve null si no hay goals', () => {
    const g = mkGraph([{ type: 'person', id: 'x' }], [])
    const seed = pickSeedForContext({ nextGoalId: 'x', anchorGoalId: 'y' }, g)
    expect(seed).toBeNull()
  })
})

describe('brain/surface · describeGlow', () => {
  it('devuelve null si el seed no existe', () => {
    const g = mkGraph([{ type: 'goal', id: 'g1' }], [])
    expect(describeGlow(g, 'goal:no-existe', 5)).toBeNull()
  })

  it('emite filas con label y activacion top-N', () => {
    const g = mkGraph(
      [
        { type: 'goal', id: 'mundial', label: 'Ganar el Mundial' },
        { type: 'person', id: 'shian', label: 'Shian Navarro' },
        { type: 'org', id: 'fedepol', label: 'FEDEPOL' },
      ],
      [
        { srcType: 'deal', srcId: 'd1', dstType: 'person', dstId: 'shian', kind: 'deal_contact', weight: 7 },
        { srcType: 'deal', srcId: 'd1', dstType: 'org', dstId: 'fedepol', kind: 'deal_client_org', weight: 6 },
        // Deal conectado al goal (proxy simple).
        { srcType: 'goal', srcId: 'mundial', dstType: 'deal', dstId: 'd1', kind: 'goal_step', weight: 5 },
      ],
    )
    const glow = describeGlow(g, 'goal:mundial', 5)
    expect(glow).not.toBeNull()
    expect(glow!.seedLabel).toBe('Ganar el Mundial')
    expect(glow!.rows.length).toBeGreaterThan(0)
    // El deal directo tiene que aparecer con activacion > 0.
    const dealRow = glow!.rows.find((r) => r.nodeKey === 'deal:d1')
    expect(dealRow).toBeDefined()
    expect(dealRow!.activation).toBeGreaterThan(0)
  })

  it('la reason es el kind mas pesado que conecta seed↔nodo directo', () => {
    const g = mkGraph(
      [
        { type: 'person', id: 'a', label: 'A' },
        { type: 'person', id: 'b', label: 'B' },
      ],
      [
        // Dos aristas seed↔b con distinto peso: gana la mas fuerte (family=8 > moment=6).
        { srcType: 'person', srcId: 'a', dstType: 'person', dstId: 'b', kind: 'family', weight: 8 },
        { srcType: 'person', srcId: 'a', dstType: 'person', dstId: 'b', kind: 'moment_participant', weight: 6 },
      ],
    )
    const glow = describeGlow(g, 'person:a', 5)
    const bRow = glow!.rows.find((r) => r.nodeKey === 'person:b')
    expect(bRow?.reason).toBe('family')
  })

  it('reason=null para nodos que llegan a hop >= 2 (sin arista directa)', () => {
    const g = mkGraph(
      [
        { type: 'person', id: 'a' },
        { type: 'person', id: 'b' },
        { type: 'person', id: 'c' },
      ],
      [
        { srcType: 'person', srcId: 'a', dstType: 'person', dstId: 'b', kind: 'family', weight: 8 },
        { srcType: 'person', srcId: 'b', dstType: 'person', dstId: 'c', kind: 'family', weight: 8 },
      ],
    )
    const glow = describeGlow(g, 'person:a', 5)
    const cRow = glow!.rows.find((r) => r.nodeKey === 'person:c')
    expect(cRow).toBeDefined()
    expect(cRow!.reason).toBeNull()
  })

  it('respeta el limit', () => {
    const g = mkGraph(
      [{ type: 'goal', id: 'g' }, ...Array.from({ length: 10 }, (_, i) => ({ type: 'person' as const, id: `p${i}` }))],
      Array.from({ length: 10 }, (_, i) => ({
        srcType: 'goal' as const,
        srcId: 'g',
        dstType: 'person' as const,
        dstId: `p${i}`,
        kind: 'deal_contact' as const,
        weight: 5,
      })),
    )
    const glow = describeGlow(g, 'goal:g', 3)
    expect(glow!.rows).toHaveLength(3)
  })

  it('label fallback al id si el nodo no tiene label explicito', () => {
    const g = mkGraph(
      [
        { type: 'goal', id: 'g' },
        { type: 'person', id: 'sin-label' },
      ],
      [
        { srcType: 'goal', srcId: 'g', dstType: 'person', dstId: 'sin-label', kind: 'deal_contact', weight: 5 },
      ],
    )
    const glow = describeGlow(g, 'goal:g', 5)
    const row = glow!.rows.find((r) => r.nodeKey === 'person:sin-label')
    expect(row?.label).toBe('sin-label')
  })
})
