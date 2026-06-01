import { describe, it, expect } from 'vitest'

import { filterGraph, isNodeVisible } from './filter'
import type { GraphData, GraphNode } from './types'

function node(partial: Partial<GraphNode> & Pick<GraphNode, 'id'>): GraphNode {
  return {
    label: 'XX',
    fullName: partial.id,
    category: 'networking',
    healthScore: 50,
    interactionCount: 0,
    ...partial,
  }
}

const self = node({ id: 'self', category: 'self', healthScore: 100, isSelf: true, fx: 0, fy: 0 })
// Caso del bug en prod: 2 personas SIN history → interactionCount 0.
const diana = node({ id: 'diana-carolina', fullName: 'Diana Carolina', category: 'personal', healthScore: 50, interactionCount: 0 })
const maria = node({ id: 'maria-isabel', fullName: 'Maria Isabel', category: 'familia', healthScore: 50, interactionCount: 0 })

const data: GraphData = {
  nodes: [self, diana, maria],
  edges: [
    { source: 'self', target: 'diana-carolina', category: 'personal', label: 'Personal', color: '#000' },
    { source: 'self', target: 'maria-isabel', category: 'familia', label: 'Familia', color: '#000' },
  ],
}

describe('filterGraph — fix del grafo vacío', () => {
  it('REGRESIÓN: personas sin history (interactionCount 0) APARECEN con el slider en 0', () => {
    const out = filterGraph(data, { category: 'all', minHealth: 0 })
    const ids = out.nodes.map((n) => n.id)
    expect(ids).toContain('diana-carolina')
    expect(ids).toContain('maria-isabel')
    expect(ids).toContain('self')
    expect(out.nodes).toHaveLength(3)
    expect(out.edges).toHaveLength(2)
  })

  it('slider en 0 + categoría "all" → se ven TODAS las personas', () => {
    const out = filterGraph(data, { category: 'all', minHealth: 0 })
    // ninguna persona queda fuera por falta de "actividad"
    expect(out.nodes.filter((n) => !n.isSelf)).toHaveLength(2)
  })

  it('self siempre visible, incluso con minHealth alto', () => {
    const out = filterGraph(data, { category: 'all', minHealth: 100 })
    expect(out.nodes.map((n) => n.id)).toContain('self')
    expect(isNodeVisible(self, { category: 'all', minHealth: 100 })).toBe(true)
  })

  it('salud mínima SIGUE filtrando: minHealth 60 oculta personas con score 50', () => {
    const out = filterGraph(data, { category: 'all', minHealth: 60 })
    expect(out.nodes.map((n) => n.id)).toEqual(['self']) // solo self
    expect(out.edges).toHaveLength(0) // edges podados (sus targets no son visibles)
  })

  it('filtro de categoría: solo la categoría elegida + self', () => {
    const out = filterGraph(data, { category: 'familia', minHealth: 0 })
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['maria-isabel', 'self'])
    expect(out.edges.map((e) => e.target)).toEqual(['maria-isabel'])
  })

  it('persona con score por encima del mínimo pasa aunque interactionCount sea 0', () => {
    const activa = node({ id: 'p', healthScore: 80, interactionCount: 0 })
    expect(isNodeVisible(activa, { category: 'all', minHealth: 70 })).toBe(true)
  })
})
