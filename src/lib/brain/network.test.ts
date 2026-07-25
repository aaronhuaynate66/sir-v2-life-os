// SIR V2 — Tests del puente RED/CONEXIONES para el chat (askSir).

import { describe, it, expect } from 'vitest'

import {
  isNetworkQuery,
  resolveNetworkSeeds,
  buildNetworkConnections,
  renderNetworkBlock,
  type NetworkConnection,
} from './network'
import { projectGraph, type ProjectorInput } from './projector'
import type { Graph } from './types'

// ─── isNetworkQuery ──────────────────────────────────────────────────────────
describe('isNetworkQuery', () => {
  it('detecta preguntas de red / caminos', () => {
    const yes = [
      '¿Quién de mi red conoce a alguien en Interbank?',
      '¿Quién me puede presentar a Diana?',
      '¿Quién está más conectado a Grupo HNG?',
      '¿Quién me podría ayudar a acercarme al Mundial?',
      '¿Qué lazos débiles tengo hacia esa empresa?',
      '¿En qué empresa trabaja gente que conozco?',
      '¿Quién me abre la puerta a ese cliente?',
    ]
    for (const q of yes) expect(isNetworkQuery(q)).toBe(true)
  })

  it('NO dispara en preguntas normales', () => {
    const no = [
      '¿Cómo está Diana hoy?',
      '¿Cuánto pesé esta semana?',
      '¿Qué recordatorios tengo pendientes?',
      'Dame un consejo corto para hoy.',
      '¿Cuál es mi norte del año?',
    ]
    for (const q of no) expect(isNetworkQuery(q)).toBe(false)
  })

  it('es insensible a tildes y mayúsculas', () => {
    expect(isNetworkQuery('QUIEN ESTA MAS CONECTADO a mi trabajo')).toBe(true)
    expect(isNetworkQuery('quién me conecta con Laura')).toBe(true)
  })
})

// ─── grafo de prueba ─────────────────────────────────────────────────────────
// Red pequeña: un objetivo "Mundial" atado a Aaron-persona "Ale"; una empresa
// "Grupo HNG" con un deal cuyo contacto es "Beto"; familia Ale↔Caro.
function fixtureGraph(): Graph {
  const input: ProjectorInput = {
    people: [
      { id: 'p_ale', name: 'Ale Torres' },
      { id: 'p_beto', name: 'Beto Ruiz' },
      { id: 'p_caro', name: 'Caro Díaz' },
      { id: 'p_solo', name: 'Persona Suelta' },
    ],
    goals: [
      { id: 'g_mundial', title: 'Mundial 2026', related_persons: ['p_ale'] },
    ],
    orgs: [
      { slug: 'grupo-hng', name: 'Grupo HNG' },
      { slug: 'sienna', name: 'Sienna Minerals S.A.C.' },
    ],
    deals: [
      { id: 'd_1', title: 'Deal HNG', contact_person_id: 'p_beto', client_org_slug: 'grupo-hng' },
    ],
    personLinks: [{ person_a_id: 'p_ale', person_b_id: 'p_caro', kind: 'hermana' }],
  }
  return projectGraph(input)
}

// ─── resolveNetworkSeeds ─────────────────────────────────────────────────────
describe('resolveNetworkSeeds', () => {
  const graph = fixtureGraph()

  it('matchea una empresa nombrada literalmente', () => {
    const seeds = resolveNetworkSeeds('¿Quién está más conectado a Grupo HNG?', graph)
    expect(seeds.map((s) => s.nodeKey)).toContain('org:grupo-hng')
  })

  it('matchea una empresa aunque falte el sufijo (S.A.C.)', () => {
    // "Sienna Minerals" en la pregunta → matchea "Sienna Minerals S.A.C." por
    // los dos tokens largos, sin exigir el sufijo societario.
    const seeds = resolveNetworkSeeds('¿Quién me acerca a la licitación de Sienna Minerals?', graph)
    expect(seeds.some((s) => s.type === 'org' && s.label === 'Sienna Minerals S.A.C.')).toBe(true)
  })

  it('matchea un objetivo nombrado', () => {
    const seeds = resolveNetworkSeeds('¿Quién me ayuda a llegar al Mundial 2026?', graph)
    expect(seeds.some((s) => s.type === 'goal' && s.label === 'Mundial 2026')).toBe(true)
  })

  it('incluye personas ya resueltas por askSir (extraPersonIds)', () => {
    const seeds = resolveNetworkSeeds('¿Quién me puede presentar a alguien cercano?', graph, ['p_ale'])
    expect(seeds.map((s) => s.nodeKey)).toContain('person:p_ale')
  })

  it('no arrastra nodos no nombrados', () => {
    const seeds = resolveNetworkSeeds('¿Quién está conectado a Grupo HNG?', graph)
    expect(seeds.map((s) => s.nodeKey)).not.toContain('person:p_solo')
  })
})

// ─── buildNetworkConnections ─────────────────────────────────────────────────
describe('buildNetworkConnections', () => {
  const graph = fixtureGraph()

  it('desde la empresa trae el deal y su contacto por difusión', () => {
    const seeds = resolveNetworkSeeds('¿Quién está conectado a Grupo HNG?', graph)
    const conns = buildNetworkConnections(graph, seeds, 12)
    const labels = conns.map((c) => c.label)
    // La empresa → deal (directo) → Beto (2 saltos).
    expect(labels).toContain('Deal HNG')
    expect(labels).toContain('Beto Ruiz')
    // No incluye la propia semilla.
    expect(labels).not.toContain('Grupo HNG')
  })

  it('la arista directa lleva razón y peso; la indirecta no', () => {
    const seeds = resolveNetworkSeeds('conexiones de Grupo HNG', graph)
    const conns = buildNetworkConnections(graph, seeds, 12)
    const deal = conns.find((c) => c.label === 'Deal HNG')
    expect(deal?.weight).not.toBeNull()
    expect(typeof deal?.reason).toBe('string')
    const beto = conns.find((c) => c.label === 'Beto Ruiz')
    // Beto no está conectado DIRECTO a la empresa (viene por el deal) → sin peso.
    expect(beto?.weight).toBeNull()
  })

  it('sin semillas → sin conexiones', () => {
    expect(buildNetworkConnections(graph, [], 12)).toHaveLength(0)
  })

  it('ranking desc por activación', () => {
    const seeds = resolveNetworkSeeds('conexiones de Grupo HNG', graph)
    const conns = buildNetworkConnections(graph, seeds, 12)
    for (let i = 1; i < conns.length; i++) {
      expect(conns[i - 1].activation).toBeGreaterThanOrEqual(conns[i].activation)
    }
  })
})

// ─── renderNetworkBlock ──────────────────────────────────────────────────────
describe('renderNetworkBlock', () => {
  it('renderiza ancla + conexiones agrupadas por tipo, con marco honesto', () => {
    const seeds = [{ nodeKey: 'org:grupo-hng', type: 'org' as const, label: 'Grupo HNG' }]
    const conns: NetworkConnection[] = [
      { label: 'Beto Ruiz', type: 'person', reason: 'contacto de una oportunidad', weight: 7, activation: 12.3 },
      { label: 'Deal HNG', type: 'deal', reason: 'empresa de una oportunidad', weight: 6, activation: 20 },
    ]
    const out = renderNetworkBlock(seeds, conns)
    expect(out).toContain('== RED / CONEXIONES')
    expect(out).toContain('NO es adivinación')
    expect(out).toContain('Grupo HNG')
    expect(out).toContain('Beto Ruiz')
    expect(out).toContain('peso 7')
    // Agrupa por tipo (personas y oportunidades como encabezados).
    expect(out).toContain('Personas:')
    expect(out).toContain('Oportunidades:')
  })

  it('con ancla pero sin conexiones lo dice sin negar la capacidad', () => {
    const seeds = [{ nodeKey: 'person:p1', type: 'person' as const, label: 'Solo' }]
    const out = renderNetworkBlock(seeds, [])
    expect(out).toContain('== RED / CONEXIONES')
    expect(out).toContain('No hay nodos conectados')
  })

  it('vacío total → cadena vacía', () => {
    expect(renderNetworkBlock([], [])).toBe('')
  })

  it('conexión indirecta se muestra sin peso', () => {
    const conns: NetworkConnection[] = [
      { label: 'Lejano', type: 'person', reason: 'conectado indirectamente (varios saltos)', weight: null, activation: 3 },
    ]
    const out = renderNetworkBlock([{ nodeKey: 'org:x', type: 'org', label: 'X' }], conns)
    expect(out).toContain('Lejano')
    expect(out).not.toContain('peso ')
  })
})
