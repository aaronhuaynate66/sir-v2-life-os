import { describe, expect, it } from 'vitest'

import { projectGraph } from './projector'
import { BASE_WEIGHT, edgeKey } from './types'

describe('brain/projector · caso vacio', () => {
  it('con input vacio devuelve grafo vacio', () => {
    const g = projectGraph({})
    expect(g.nodes).toHaveLength(0)
    expect(g.edges).toHaveLength(0)
  })
})

describe('brain/projector · nodos', () => {
  it('crea nodos person, goal, org con label', () => {
    const g = projectGraph({
      people: [{ id: 'diana', name: 'Diana Carolina' }],
      goals: [{ id: 'mundial', title: 'Ganar el Mundial de Bomberos' }],
      orgs: [{ slug: 'fedepol', name: 'FEDEPOL' }],
    })
    expect(g.nodes).toHaveLength(3)
    const diana = g.nodes.find((n) => n.type === 'person' && n.id === 'diana')
    expect(diana?.label).toBe('Diana Carolina')
    const mundial = g.nodes.find((n) => n.type === 'goal' && n.id === 'mundial')
    expect(mundial?.label).toBe('Ganar el Mundial de Bomberos')
    const fed = g.nodes.find((n) => n.type === 'org' && n.id === 'fedepol')
    expect(fed?.label).toBe('FEDEPOL')
  })

  it('no duplica nodos si aparecen varias veces', () => {
    const g = projectGraph({
      people: [
        { id: 'diana', name: 'Diana' },
        { id: 'diana', name: 'Diana' },
      ],
    })
    expect(g.nodes.filter((n) => n.id === 'diana')).toHaveLength(1)
  })
})

describe('brain/projector · aristas', () => {
  it('emite arista family desde person_links con peso base', () => {
    const g = projectGraph({
      people: [
        { id: 'aaron', name: 'Aaron' },
        { id: 'esteban', name: 'Esteban' },
      ],
      personLinks: [{ person_a_id: 'aaron', person_b_id: 'esteban', kind: 'father' }],
    })
    const e = g.edges.find((x) => x.kind === 'family')
    expect(e).toBeDefined()
    expect(e?.srcId).toBe('aaron')
    expect(e?.dstId).toBe('esteban')
    expect(e?.derivedWeight).toBe(BASE_WEIGHT.family)
    expect(e?.weight).toBe(BASE_WEIGHT.family)
  })

  it('omite arista family si una persona no existe', () => {
    const g = projectGraph({
      people: [{ id: 'aaron', name: 'Aaron' }],
      personLinks: [{ person_a_id: 'aaron', person_b_id: 'fantasma' }],
    })
    expect(g.edges.filter((x) => x.kind === 'family')).toHaveLength(0)
  })

  it('emite goal_step si el goal existe', () => {
    const g = projectGraph({
      goals: [{ id: 'mudanza', title: 'Mudarme con mi perro' }],
      steps: [{ id: 's1', objective_id: 'mudanza', title: 'Mudanza sabado 4-jul' }],
    })
    expect(g.edges.filter((x) => x.kind === 'goal_step')).toHaveLength(1)
    expect(g.nodes.some((n) => n.type === 'step' && n.id === 's1')).toBe(true)
  })

  it('no emite goal_step si el goal no existe (evita nodos fantasma)', () => {
    const g = projectGraph({
      steps: [{ id: 's1', objective_id: 'no-existe', title: 'Huerfano' }],
    })
    // Aunque el step aparece como nodo, la arista al goal no.
    expect(g.edges.filter((x) => x.kind === 'goal_step')).toHaveLength(0)
  })

  it('deal emite contact + client_org + related, no duplica related con contact', () => {
    const g = projectGraph({
      people: [
        { id: 'shian', name: 'Shian' },
        { id: 'oper', name: 'Operador' },
      ],
      orgs: [{ slug: 'fedepol', name: 'FEDEPOL' }],
      deals: [
        {
          id: 'd1',
          title: 'Mundial FEDEPOL',
          contact_person_id: 'shian',
          client_org_slug: 'fedepol',
          related_persons: ['shian', 'oper'], // shian ya es contact, no debe duplicarse
        },
      ],
    })
    expect(g.edges.filter((x) => x.kind === 'deal_contact')).toHaveLength(1)
    expect(g.edges.filter((x) => x.kind === 'deal_client_org')).toHaveLength(1)
    const related = g.edges.filter((x) => x.kind === 'deal_related')
    expect(related).toHaveLength(1)
    expect(related[0].dstId).toBe('oper')
  })

  it('moment emite arista a persona primaria + participantes + refs', () => {
    const g = projectGraph({
      people: [
        { id: 'mama', name: 'Mama' },
        { id: 'hermana', name: 'Hermana' },
        { id: 'amigo', name: 'Amigo' },
      ],
      moments: [{ id: 'm1', person_id: 'mama', title: 'Pelea del Mundial' }],
      momentParticipants: [{ moment_id: 'm1', person_id: 'hermana' }],
      momentReferences: [{ moment_id: 'm1', person_id: 'amigo' }],
    })
    const participants = g.edges.filter((x) => x.kind === 'moment_participant')
    const refs = g.edges.filter((x) => x.kind === 'moment_reference')
    expect(participants).toHaveLength(2) // primaria + participante
    expect(refs).toHaveLength(1)
  })

  it('tracker emite tracker_goal y tracker_step', () => {
    const g = projectGraph({
      goals: [{ id: 'g1' }],
      steps: [{ id: 's1', objective_id: 'g1' }],
      trackers: [{ id: 't1', objective_id: 'g1', objective_step_id: 's1', title: 'Vuelo' }],
    })
    expect(g.edges.some((e) => e.kind === 'tracker_goal')).toBe(true)
    expect(g.edges.some((e) => e.kind === 'tracker_step')).toBe(true)
  })
})

describe('brain/projector · pesos aprendidos', () => {
  it('suma el delta learned al peso derivado', () => {
    const key = edgeKey('person', 'aaron', 'person', 'esteban', 'family')
    const g = projectGraph({
      people: [
        { id: 'aaron' },
        { id: 'esteban' },
      ],
      personLinks: [{ person_a_id: 'aaron', person_b_id: 'esteban' }],
      learnedWeights: new Map([[key, 2]]),
    })
    const e = g.edges.find((x) => x.key === key)
    expect(e?.derivedWeight).toBe(BASE_WEIGHT.family)
    expect(e?.learnedWeight).toBe(2)
    expect(e?.weight).toBe(BASE_WEIGHT.family + 2)
  })

  it('clampa el peso final a >= 0 cuando el delta es muy negativo', () => {
    const key = edgeKey('person', 'a', 'person', 'a', 'memory_person')
    const g = projectGraph({
      people: [{ id: 'a' }],
      memories: [{ id: 'mem1', person_id: 'a' }],
      learnedWeights: new Map([[key, -50]]),
    })
    const e = g.edges.find((x) => x.key === key)
    expect(e?.weight).toBe(0)
    expect(e?.learnedWeight).toBe(-50)
  })

  it('learnedWeight vacio no rompe (ausencia = 0)', () => {
    const g = projectGraph({
      people: [{ id: 'a' }, { id: 'b' }],
      personLinks: [{ person_a_id: 'a', person_b_id: 'b' }],
    })
    const e = g.edges[0]
    expect(e.learnedWeight).toBe(0)
    expect(e.weight).toBe(e.derivedWeight)
  })
})
