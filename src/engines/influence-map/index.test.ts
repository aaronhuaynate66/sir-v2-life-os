// SIR V2 — Tests del mapa de influencia informal (16·M2).

import { describe, it, expect } from 'vitest'
import { buildInfluenceMap, type InflPerson, type InflLink } from './index'

function p(id: string, over: Partial<InflPerson> = {}): InflPerson {
  return { id, name: `P${id}`, ...over }
}

describe('buildInfluenceMap — círculo de la decisión', () => {
  it('trae gente del mismo org que el objetivo, por importancia', () => {
    const people = [
      p('alex', { name: 'Alex', orgGroup: 'HNG' }),
      p('cris', { name: 'Cristina', orgGroup: 'HNG', importanceScore: 8, title: 'Gerente' }),
      p('walt', { name: 'Walter', orgGroup: 'HNG', importanceScore: 6 }),
      p('juan', { name: 'Juan', orgGroup: 'Otra' }),
    ]
    const m = buildInfluenceMap({ people, links: [], targetId: 'alex' })
    expect(m.targetName).toBe('Alex')
    expect(m.cohort.map((n) => n.name)).toEqual(['Cristina', 'Walter'])
    expect(m.cohort[0].reason).toContain('Gerente')
  })
  it('sin org en el objetivo → sin círculo', () => {
    const m = buildInfluenceMap({ people: [p('a', { name: 'A' })], links: [], targetId: 'a' })
    expect(m.cohort).toHaveLength(0)
  })
})

describe('buildInfluenceMap — grafo', () => {
  const people = [p('a'), p('b'), p('c'), p('d'), p('t', { name: 'Target' })]
  const links: InflLink[] = [
    { aId: 'a', bId: 'b' }, { aId: 'a', bId: 'c' }, { aId: 'a', bId: 't' }, { aId: 'b', bId: 't' },
  ]
  it('hubs por grado (a es el más conectado)', () => {
    const m = buildInfluenceMap({ people, links, targetId: null })
    expect(m.hubs[0].id).toBe('a')
    expect(m.hubs[0].degree).toBe(3)
    expect(m.hasLinks).toBe(true)
  })
  it('conectores = adyacentes al objetivo', () => {
    const m = buildInfluenceMap({ people, links, targetId: 't' })
    expect(m.connectors.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })
  it('el objetivo no aparece en sus propios hubs', () => {
    const m = buildInfluenceMap({ people, links, targetId: 'a' })
    expect(m.hubs.some((n) => n.id === 'a')).toBe(false)
  })
  it('ignora aristas colgadas y self-loops', () => {
    const m = buildInfluenceMap({ people: [p('x')], links: [{ aId: 'x', bId: 'x' }, { aId: 'x', bId: 'ghost' }], targetId: null })
    expect(m.hasLinks).toBe(false)
  })
})

describe('buildInfluenceMap — puentes', () => {
  it('marca a quien conecta orgs distintas', () => {
    const people = [
      p('bridge', { name: 'Puente', orgGroup: 'A' }),
      p('x', { orgGroup: 'A' }),
      p('y', { orgGroup: 'B' }),
    ]
    const links: InflLink[] = [{ aId: 'bridge', bId: 'x' }, { aId: 'bridge', bId: 'y' }]
    const m = buildInfluenceMap({ people, links, targetId: null })
    expect(m.bridges.some((n) => n.id === 'bridge')).toBe(true)
    expect(m.bridges[0].reason).toMatch(/entornos/)
  })
})

describe('buildInfluenceMap — honestidad', () => {
  it('objetivo sin grafo ni org → nota pidiendo cargar datos', () => {
    const m = buildInfluenceMap({ people: [p('a', { name: 'A' })], links: [], targetId: 'a' })
    expect(m.note).toMatch(/no tengo grafo/i)
  })
  it('red vacía no rompe', () => {
    const m = buildInfluenceMap({ people: [], links: [], targetId: null })
    expect(m.hubs).toHaveLength(0)
    expect(m.hasLinks).toBe(false)
  })
})
