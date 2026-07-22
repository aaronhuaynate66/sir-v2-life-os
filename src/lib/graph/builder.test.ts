import { describe, it, expect } from 'vitest'

import { categoryForPerson, firstName, initialsFromName, buildGraphData, coMemberEdges } from './builder'
import type { Person, RelationshipType, PersonCategory, PersonLink } from '@/types'

describe('coMemberEdges (mesh "se conocen entre sí")', () => {
  it('conecta a los miembros de un grupo chico entre sí (full mesh)', () => {
    const e = coMemberEdges([{ label: 'CGBVP', nodeIds: ['a', 'b', 'c'] }])
    expect(e).toHaveLength(3) // a-b, a-c, b-c
    expect(e.every((x) => x.category === 'organizacion' && x.label === 'CGBVP')).toBe(true)
  })
  it('grupos > cap (6) NO reciben mesh (evita el ovillo N²)', () => {
    const big = { label: 'Grupo HNG', nodeIds: ['1', '2', '3', '4', '5', '6', '7'] }
    expect(coMemberEdges([big])).toHaveLength(0)
  })
  it('grupos de 1 no generan nada; dedup por par entre grupos', () => {
    expect(coMemberEdges([{ label: 'X', nodeIds: ['solo'] }])).toHaveLength(0)
    const seen = new Set<string>()
    const g1 = coMemberEdges([{ label: 'A', nodeIds: ['x', 'y'] }], seen)
    const g2 = coMemberEdges([{ label: 'B', nodeIds: ['y', 'x'] }], seen)
    expect(g1).toHaveLength(1)
    expect(g2).toHaveLength(0) // el par x-y ya salió
  })
})

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

describe('nodo-empresa HUB (escalón 2)', () => {
  it('≥2 personas del mismo grupo → 1 nodo-empresa + spokes + mesh en grupo chico', () => {
    const alex = person({ id: 'alex', name: 'Alex', relationship: 'professional', category: 'close', organization: 'Grupo HNG Corporación' })
    const fran = person({ id: 'fran', name: 'Francisco', relationship: 'professional', category: 'network', organization: 'K2 Seguridad y Resguardo' })
    const g = buildGraphData({ people: [alex, fran], relationships: [], selfFullName: 'A', selfEmail: 'a@x.com' })
    const orgNode = g.nodes.find((n) => n.category === 'organizacion')
    expect(orgNode).toBeTruthy()
    expect(orgNode!.shortName).toBe('Grupo HNG') // resuelto + normalizado (merge "Corporación")
    // spokes persona→empresa (siguen: no N² para grupos grandes)
    const spokes = g.edges.filter((e) => e.category === 'organizacion' && e.target === orgNode!.id)
    expect(spokes.length).toBe(2)
    // grupo CHICO (≤6) → AHORA sí hay mesh directo alex↔fran ("se conocen entre sí")
    expect(g.edges.some((e) => (e.source === 'alex' && e.target === 'fran') || (e.source === 'fran' && e.target === 'alex'))).toBe(true)
  })

  it('1 sola persona con empresa → NO crea hub', () => {
    const solo = person({ id: 'solo', name: 'Solo', relationship: 'professional', category: 'network', organization: 'Acme Inc' })
    const g = buildGraphData({ people: [solo], relationships: [], selfFullName: 'A', selfEmail: 'a@x.com' })
    expect(g.nodes.some((n) => n.category === 'organizacion')).toBe(false)
  })
})

describe('unidades transversales (tag unidad:<slug>) en el grafo', () => {
  it('crea un hub org:<slug> que conecta miembros de compañías distintas', () => {
    const victor = person({ id: 'victor', name: 'Victor R', relationship: 'friend', category: 'close', organization: 'Compañía Salamanca 127', tags: ['unidad:rit'] })
    const cornejo = person({ id: 'cornejo', name: 'Guillermo C', relationship: 'professional', category: 'network', organization: 'Compañía Rímac 21', tags: ['unidad:rit'] })
    const data = buildGraphData({
      people: [victor, cornejo],
      relationships: [],
      personLinks: [],
      directContactIds: ['victor', 'cornejo'],
      selfFullName: 'Aaron',
      selfEmail: 'a@x.com',
    })
    const ritNode = data.nodes.find((n) => n.id === 'org:rit')
    expect(ritNode).toBeDefined()
    expect(ritNode?.shortName).toBe('RIT')
    expect(ritNode?.category).toBe('organizacion')
    const ritEdges = data.edges.filter((e) => e.target === 'org:rit')
    expect(ritEdges.map((e) => e.source).sort()).toEqual(['cornejo', 'victor'])
  })

  it('una unidad con 1 miembro también aparece (intencional por tag)', () => {
    const solo = person({ id: 'solo', name: 'Solo', relationship: 'friend', category: 'close', tags: ['unidad:rit'] })
    const data = buildGraphData({ people: [solo], relationships: [], personLinks: [], directContactIds: ['solo'], selfFullName: 'A', selfEmail: 'a@x.com' })
    expect(data.nodes.some((n) => n.id === 'org:rit')).toBe(true)
  })
})
