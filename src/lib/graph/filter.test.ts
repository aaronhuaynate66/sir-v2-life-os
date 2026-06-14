import { describe, it, expect } from 'vitest'

import { filterGraph, isNodeVisible } from './filter'
import type { GraphData, GraphFilters, GraphNode } from './types'

function node(partial: Partial<GraphNode> & Pick<GraphNode, 'id'>): GraphNode {
  return {
    label: 'XX',
    shortName: partial.id,
    fullName: partial.id,
    category: 'networking',
    healthScore: 50,
    interactionCount: 0,
    score: 5,
    ...partial,
  }
}

/** Filtros con defaults; onlyDirect=false salvo que el test lo pida. */
function f(partial: Partial<GraphFilters> = {}): GraphFilters {
  return { category: 'all', minHealth: 0, onlyDirect: false, showOrgs: false, ...partial }
}

const self = node({ id: 'self', category: 'self', healthScore: 100, isSelf: true, fx: 0, fy: 0 })
const diana = node({ id: 'diana-carolina', fullName: 'Diana Carolina', category: 'personal', healthScore: 50 })
const maria = node({ id: 'maria-isabel', fullName: 'Maria Isabel', category: 'familia', healthScore: 50 })

const data: GraphData = {
  nodes: [self, diana, maria],
  edges: [
    { source: 'self', target: 'diana-carolina', category: 'personal', label: 'Personal', color: '#000' },
    { source: 'self', target: 'maria-isabel', category: 'familia', label: 'Familia', color: '#000' },
  ],
}

describe('filterGraph — categoría + salud', () => {
  it('REGRESIÓN: personas sin history APARECEN con el slider en 0', () => {
    const out = filterGraph(data, f())
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['diana-carolina', 'maria-isabel', 'self'])
    expect(out.edges).toHaveLength(2)
  })

  it('self siempre visible, incluso con minHealth alto', () => {
    const out = filterGraph(data, f({ minHealth: 100 }))
    expect(out.nodes.map((n) => n.id)).toContain('self')
    expect(isNodeVisible(self, f({ minHealth: 100 }))).toBe(true)
  })

  it('salud mínima SIGUE filtrando: minHealth 60 oculta score 50', () => {
    const out = filterGraph(data, f({ minHealth: 60 }))
    expect(out.nodes.map((n) => n.id)).toEqual(['self'])
    expect(out.edges).toHaveLength(0)
  })

  it('filtro de categoría: solo la categoría elegida + self', () => {
    const out = filterGraph(data, f({ category: 'familia' }))
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['maria-isabel', 'self'])
    expect(out.edges.map((e) => e.target)).toEqual(['maria-isabel'])
  })
})

describe('filterGraph — toggle "solo vínculos directos" (oculta 2º grado)', () => {
  // Diana = contacto directo; Jorge = 2º grado (familiar de Diana, sin interacción).
  const jorge = node({ id: 'jorge', fullName: 'Jorge', category: 'familia', healthScore: 50, secondDegree: true })
  const data2: GraphData = {
    nodes: [self, diana, jorge],
    edges: [
      { source: 'self', target: 'diana-carolina', category: 'personal', label: 'Personal', color: '#000' },
      { source: 'diana-carolina', target: 'jorge', category: 'familia', label: 'Padre', color: '#000' },
    ],
  }

  it('onlyDirect=true → oculta el 2º grado y poda su arista; quedan self + directo', () => {
    const out = filterGraph(data2, f({ onlyDirect: true }))
    const ids = out.nodes.map((n) => n.id).sort()
    expect(ids).toEqual(['diana-carolina', 'self'])
    expect(ids).not.toContain('jorge')
    // la arista diana→jorge se poda (jorge no es visible); queda self→diana
    expect(out.edges).toEqual([{ source: 'self', target: 'diana-carolina', category: 'personal', label: 'Personal', color: '#000' }])
  })

  it('onlyDirect=false → el 2º grado se muestra', () => {
    const out = filterGraph(data2, f({ onlyDirect: false }))
    expect(out.nodes.map((n) => n.id)).toContain('jorge')
    expect(out.edges).toHaveLength(2)
  })

  it('self y contactos directos NUNCA se ocultan por onlyDirect', () => {
    expect(isNodeVisible(self, f({ onlyDirect: true }))).toBe(true)
    expect(isNodeVisible(diana, f({ onlyDirect: true }))).toBe(true)
    expect(isNodeVisible(jorge, f({ onlyDirect: true }))).toBe(false)
  })

  it('compone con categoría: onlyDirect oculta 2º grado aunque matchee la categoría', () => {
    // jorge es 'familia'; con categoría=familia + onlyDirect igual se oculta.
    expect(isNodeVisible(jorge, f({ onlyDirect: true, category: 'familia' }))).toBe(false)
  })
})

describe('filterGraph — toggle "Mostrar organizaciones" (orgs ocultas por defecto)', () => {
  const org = node({ id: 'org:grupo-hng', fullName: 'Grupo HNG', category: 'organizacion', healthScore: 100 })
  const dataOrg: GraphData = {
    nodes: [self, diana, org],
    edges: [
      { source: 'self', target: 'diana-carolina', category: 'personal', label: 'Personal', color: '#000' },
      { source: 'self', target: 'org:grupo-hng', category: 'organizacion', label: 'Org', color: '#000' },
    ],
  }

  it('por defecto (showOrgs=false) la organización NO aparece', () => {
    const out = filterGraph(dataOrg, f())
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['diana-carolina', 'self'])
    // El edge a la org se poda.
    expect(out.edges.map((e) => e.target)).toEqual(['diana-carolina'])
    expect(isNodeVisible(org, f())).toBe(false)
  })

  it('con showOrgs=true la organización SÍ aparece', () => {
    const out = filterGraph(dataOrg, f({ showOrgs: true }))
    expect(out.nodes.map((n) => n.id)).toContain('org:grupo-hng')
    expect(isNodeVisible(org, f({ showOrgs: true }))).toBe(true)
  })

  it('showOrgs no afecta a las personas', () => {
    expect(isNodeVisible(diana, f({ showOrgs: false }))).toBe(true)
    expect(isNodeVisible(diana, f({ showOrgs: true }))).toBe(true)
  })
})
