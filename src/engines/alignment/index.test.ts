// SIR V2 — Tests del Alignment Engine (Etapa 4 MVP).
//
// Lógica pura y determinística (now inyectado). Casos pedidos: objetivo
// alineado, a la deriva, necesita atención, sin datos (sin vínculo / sin
// señales), múltiples objetivos (orden por urgencia), vínculo ausente.

import { describe, it, expect } from 'vitest'

import type { Goal, Person, Relationship } from '@/types'
import { computeGoalAlignment, computeAlignments } from './index'

const NOW = new Date('2026-06-01T12:00:00.000Z')

function person(o: Partial<Person> & { id: string }): Person {
  return {
    name: o.id,
    relationship: 'romantic',
    category: 'inner_circle',
    importanceScore: 8,
    energyImpact: 'neutral',
    trustLevel: 7,
    contactFrequency: '',
    tags: [],
    notes: '',
    ...o,
  } as Person
}

function rel(personId: string, status: Relationship['status'] = 'active'): Relationship {
  return {
    id: `r_${personId}`, personId, type: 'romantic', status, depth: 6, reciprocity: 6,
    history: [], sharedGoals: [], tensions: [], strengths: [],
  }
}

function goal(o: Partial<Goal> & { id: string }): Goal {
  return {
    title: o.id, description: '', category: 'relational', priority: 'high', status: 'active',
    progress: 50, milestones: [], relatedGoals: [], relatedPersons: [], peaceImpact: 5,
    obstacles: [], nextAction: '', createdAt: '', updatedAt: '', ...o,
  }
}

const ctx = (people: Person[], relationships: Relationship[] = []) => ({ people, relationships, now: NOW })

describe('computeGoalAlignment — estados', () => {
  it('ALINEADO: contacto reciente + relación activa + vínculo energizante', () => {
    const p = person({ id: 'pareja', lastContact: '2026-05-30', energyImpact: 'energizing' }) // 2d
    const g = goal({ id: 'g1', title: 'Ser mejor pareja', relatedPersons: ['pareja'] })
    const a = computeGoalAlignment(g, ctx([p], [rel('pareja', 'active')]))
    expect(a.state).toBe('aligned')
    expect(a.linkedPersonNames).toEqual(['pareja'])
    expect(a.signals.some((s) => s.kind === 'contact_recency' && s.concern === 0)).toBe(true)
  })

  it('A LA DERIVA: sin contacto 20 días (concern 1) sin señales peores', () => {
    const p = person({ id: 'pareja', lastContact: '2026-05-12', energyImpact: 'neutral' }) // 20d
    const g = goal({ id: 'g1', relatedPersons: ['pareja'] })
    const a = computeGoalAlignment(g, ctx([p], [rel('pareja', 'active')]))
    expect(a.state).toBe('drifting')
  })

  it('NECESITA ATENCIÓN: relación en tensión + sin contacto 40 días (el ejemplo del roadmap)', () => {
    const p = person({ id: 'pareja', lastContact: '2026-04-22' }) // 40d
    const g = goal({ id: 'g1', title: 'Ser mejor pareja', relatedPersons: ['pareja'] })
    const a = computeGoalAlignment(g, ctx([p], [rel('pareja', 'strained')]))
    expect(a.state).toBe('needs_attention')
    expect(a.signals.some((s) => s.kind === 'relationship_status' && s.concern === 2)).toBe(true)
    expect(a.signals.some((s) => s.kind === 'contact_recency' && s.concern === 2)).toBe(true)
    expect(a.summary).toContain('reflexionar') // tono reflexivo, no culposo
  })

  it('peor señal manda: contacto reciente PERO relación en tensión → needs_attention', () => {
    const p = person({ id: 'x', lastContact: '2026-05-31' }) // 1d, concern 0
    const g = goal({ id: 'g1', relatedPersons: ['x'] })
    const a = computeGoalAlignment(g, ctx([p], [rel('x', 'strained')]))
    expect(a.state).toBe('needs_attention')
  })
})

describe('computeGoalAlignment — datos insuficientes (no inventa brecha)', () => {
  it('objetivo SIN personas vinculadas → insufficient_data, sin señales', () => {
    const g = goal({ id: 'g1', title: 'Meditar más', category: 'personal', relatedPersons: [] })
    const a = computeGoalAlignment(g, ctx([]))
    expect(a.state).toBe('insufficient_data')
    expect(a.signals).toEqual([])
    expect(a.summary).toContain('Vinculá personas')
  })

  it('persona vinculada que NO existe en el store → insufficient_data', () => {
    const g = goal({ id: 'g1', relatedPersons: ['fantasma'] })
    const a = computeGoalAlignment(g, ctx([person({ id: 'otra' })]))
    expect(a.state).toBe('insufficient_data')
    expect(a.linkedPersonNames).toEqual([])
  })

  it('persona vinculada SIN lastContact NI relación registrada NI energía → insufficient_data', () => {
    const p = person({ id: 'p', energyImpact: 'neutral' }) // sin lastContact
    const g = goal({ id: 'g1', relatedPersons: ['p'] })
    const a = computeGoalAlignment(g, ctx([p], [])) // sin relación
    expect(a.state).toBe('insufficient_data')
    expect(a.linkedPersonNames).toEqual(['p']) // resolvió la persona, pero sin señales
  })
})

describe('computeGoalAlignment — múltiples personas', () => {
  it('agrega la PEOR señal entre varias personas vinculadas', () => {
    const ok = person({ id: 'ok', lastContact: '2026-05-30' }) // reciente
    const bad = person({ id: 'bad', lastContact: '2026-03-01' }) // >40d
    const g = goal({ id: 'g1', title: 'Cuidar a mi familia', relatedPersons: ['ok', 'bad'] })
    const a = computeGoalAlignment(g, ctx([ok, bad], [rel('ok'), rel('bad')]))
    expect(a.state).toBe('needs_attention')
    expect(a.linkedPersonNames.sort()).toEqual(['bad', 'ok'])
  })
})

describe('computeAlignments — múltiples objetivos', () => {
  it('filtra no-activos y ordena por urgencia (needs_attention → aligned → insufficient_data)', () => {
    const pBad = person({ id: 'bad', lastContact: '2026-03-01' })
    const pOk = person({ id: 'ok', lastContact: '2026-05-31', energyImpact: 'energizing' })
    const goals: Goal[] = [
      goal({ id: 'aligned', relatedPersons: ['ok'] }),
      goal({ id: 'attention', relatedPersons: ['bad'] }),
      goal({ id: 'nodata', relatedPersons: [] }),
      goal({ id: 'paused', relatedPersons: ['bad'], status: 'paused' }), // excluido
    ]
    const out = computeAlignments(goals, ctx([pBad, pOk], [rel('ok'), rel('bad', 'strained')]))
    expect(out.map((a) => a.goalId)).toEqual(['attention', 'aligned', 'nodata'])
  })

  it('sin objetivos activos → []', () => {
    expect(computeAlignments([goal({ id: 'g', status: 'completed' })], ctx([]))).toEqual([])
  })
})
