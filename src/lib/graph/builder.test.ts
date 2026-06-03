import { describe, it, expect } from 'vitest'

import { categoryForPerson, firstName, initialsFromName, buildGraphData } from './builder'
import type { Person, RelationshipType, PersonCategory, PersonLink } from '@/types'

function person(over: Partial<Person> & Pick<Person, 'relationship' | 'category'>): Person {
  return {
    id: 'p1',
    name: 'Test Persona',
    importanceScore: 5,
    energyImpact: 'neutral',
    trustLevel: 5,
    contactFrequency: 'monthly',
    tags: [],
    notes: '',
    ...over,
  } as Person
}

describe('categoryForPerson — bucket por TIPO de relación (fix semántico)', () => {
  it('PAREJA (romantic) → personal, NO networking, aunque category sea "network"', () => {
    expect(categoryForPerson(person({ relationship: 'romantic', category: 'network' }))).toBe('personal')
    expect(categoryForPerson(person({ relationship: 'romantic', category: 'peripheral' }))).toBe('personal')
  })

  it('REGRESIÓN Diana: friend + category "network" → personal (antes caía en networking)', () => {
    expect(categoryForPerson(person({ relationship: 'friend', category: 'network' }))).toBe('personal')
  })

  it('amigo cercano sigue siendo personal', () => {
    expect(categoryForPerson(person({ relationship: 'friend', category: 'inner_circle' }))).toBe('personal')
  })

  it('family → familia (cualquier category)', () => {
    expect(categoryForPerson(person({ relationship: 'family', category: 'network' }))).toBe('familia')
  })

  it('professional / mentor / mentee → profesional', () => {
    for (const r of ['professional', 'mentor', 'mentee'] as RelationshipType[]) {
      expect(categoryForPerson(person({ relationship: r, category: 'close' }))).toBe('profesional')
    }
  })

  it('acquaintance → networking', () => {
    expect(categoryForPerson(person({ relationship: 'acquaintance', category: 'network' }))).toBe('networking')
  })

  it('tags estrategico/desarrollo overridean el tipo de relación', () => {
    expect(categoryForPerson(person({ relationship: 'romantic', category: 'close', tags: ['estrategico'] }))).toBe('estrategico')
    expect(categoryForPerson(person({ relationship: 'family', category: 'close', tags: ['desarrollo'] }))).toBe('desarrollo')
  })
})

describe('firstName', () => {
  it('toma el primer token', () => {
    expect(firstName('Diana Carolina')).toBe('Diana')
    expect(firstName('Aarón Huaynate Espinoza')).toBe('Aarón')
    expect(firstName('Papa')).toBe('Papa')
  })
  it('robusto ante vacío/espacios/null', () => {
    expect(firstName('')).toBe('')
    expect(firstName('   ')).toBe('')
    expect(firstName(null)).toBe('')
    expect(firstName(undefined)).toBe('')
  })
})

describe('initialsFromName (sigue intacto)', () => {
  it('2 iniciales', () => {
    expect(initialsFromName('Diana Carolina')).toBe('DC')
    expect(initialsFromName('Maria Isabel')).toBe('MI')
  })
})

describe('buildGraphData — aristas de familia persona↔persona (A.4)', () => {
  const diana = person({ id: 'p_diana', name: 'Diana', slug: 'diana', relationship: 'romantic', category: 'close' })
  const padre = person({ id: 'p_padre', name: 'Jorge', slug: 'jorge', relationship: 'family', category: 'close' })
  const link: PersonLink = { id: 'l1', personAId: 'p_diana', personBId: 'p_padre', kind: 'padre', createdAt: '2026-06-01T00:00:00Z' }

  it('dibuja la arista familia con el parentesco como label', () => {
    const g = buildGraphData({ people: [diana, padre], relationships: [], personLinks: [link], selfFullName: 'Aaron', selfEmail: 'a@x.com' })
    const fam = g.edges.find((e) => e.source === 'diana' && e.target === 'jorge')
    expect(fam).toBeTruthy()
    expect(fam!.category).toBe('familia')
    expect(fam!.label).toBe('Padre')
  })

  it('BUG FIX: el familiar-solo (target de link, sin interacción directa) NO cuelga del centro', () => {
    const g = buildGraphData({ people: [diana, padre], relationships: [], personLinks: [link], selfFullName: 'Aaron', selfEmail: 'a@x.com' })
    // Diana (contacto directo, no es target) → arista al centro.
    expect(g.edges.some((e) => e.source === 'self' && e.target === 'diana')).toBe(true)
    // Jorge (solo familiar de Diana, sin observations/logs) → SIN arista al centro.
    expect(g.edges.some((e) => e.source === 'self' && e.target === 'jorge')).toBe(false)
    // y queda marcado 2º grado.
    expect(g.nodes.find((n) => n.id === 'jorge')?.secondDegree).toBe(true)
    expect(g.nodes.find((n) => n.id === 'diana')?.secondDegree).toBe(false)
  })

  it('familiar que TAMBIÉN es contacto directo (en directContactIds) conserva su arista al centro', () => {
    const g = buildGraphData({
      people: [diana, padre], relationships: [], personLinks: [link],
      directContactIds: ['p_padre'], selfFullName: 'A', selfEmail: 'a@x.com',
    })
    expect(g.edges.some((e) => e.source === 'self' && e.target === 'jorge')).toBe(true)
    expect(g.nodes.find((n) => n.id === 'jorge')?.secondDegree).toBe(false)
  })

  it('omite el link si un extremo no resuelve a un nodo (persona borrada)', () => {
    const g = buildGraphData({ people: [diana], relationships: [], personLinks: [link], selfFullName: 'A', selfEmail: 'a@x.com' })
    expect(g.edges.some((e) => e.category === 'familia')).toBe(false)
  })

  it('sin personLinks → solo aristas self→persona (compat)', () => {
    const g = buildGraphData({ people: [diana, padre], relationships: [], selfFullName: 'A', selfEmail: 'a@x.com' })
    expect(g.edges.every((e) => e.source === 'self')).toBe(true)
    expect(g.nodes.every((n) => !n.secondDegree)).toBe(true)
  })
})

describe('buildGraphData — aristas self↔persona (0058, sentinel "self")', () => {
  const maria = person({ id: 'p_maria', name: 'María Isabel', slug: 'maria', relationship: 'family', category: 'close' })
  const selfLink: PersonLink = { id: 'sl1', personAId: 'self', personBId: 'p_maria', kind: 'madre', createdAt: '2026-06-03T00:00:00Z' }

  it('dibuja la arista self→persona en color familia con el parentesco', () => {
    const g = buildGraphData({ people: [maria], relationships: [], personLinks: [selfLink], selfFullName: 'Aaron', selfEmail: 'a@x.com' })
    const fam = g.edges.find((e) => e.source === 'self' && e.target === 'maria' && e.category === 'familia')
    expect(fam).toBeTruthy()
    expect(fam!.label).toBe('Madre')
  })

  it('la familia directa del self NO se duplica con la arista genérica ni queda 2º grado', () => {
    const g = buildGraphData({ people: [maria], relationships: [], personLinks: [selfLink], selfFullName: 'A', selfEmail: 'a@x.com' })
    const selfEdges = g.edges.filter((e) => e.source === 'self' && e.target === 'maria')
    expect(selfEdges).toHaveLength(1) // solo la de familia, no la genérica
    expect(selfEdges[0].category).toBe('familia')
    expect(g.nodes.find((n) => n.id === 'maria')?.secondDegree).toBe(false)
  })
})
