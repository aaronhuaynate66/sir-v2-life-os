import { describe, it, expect } from 'vitest'
import { selectInlineGap, gapMatchesIntent } from './inline'
import type { Person, Goal } from '@/types'

const person = (over: Partial<Person>): Person => ({
  id: 'p1', slug: 'p1', name: 'Diana Torres', relationship: 'romantic',
  category: 'inner', importanceScore: 9, energyImpact: 'positive', trustLevel: 8,
  contactFrequency: '', tags: [], notes: '', createdAt: '', updatedAt: '',
  ...over,
}) as Person

const goal = (over: Partial<Goal>): Goal => ({
  id: 'g1', title: 'Ir al Mundial', description: '', category: 'personal',
  priority: 'high', status: 'active', progress: 0, milestones: [], relatedGoals: [],
  relatedPersons: [], peaceImpact: 8, obstacles: [], nextAction: '',
  createdAt: '', updatedAt: '',
  ...over,
}) as Goal

describe('selectInlineGap — ciclo', () => {
  const diana = person({ gender: 'female', cycleStartDate: undefined, ambito: 'personal' })

  it('pregunta el ciclo cuando la consulta es sobre su ánimo y la nombra', () => {
    const g = selectInlineGap('¿por qué está distante Diana?', [diana], [])
    expect(g?.kind).toBe('cycle')
    expect(g?.field).toBe('cycleStartDate')
  })

  it('NO pregunta si la consulta no toca su estado/ánimo', () => {
    expect(selectInlineGap('¿cuándo fue mi último contacto con Diana?', [diana], [])).toBeNull()
  })

  it('NO pregunta si no la nombra', () => {
    expect(selectInlineGap('¿cómo está ella de ánimo?', [diana], [])).toBeNull()
  })

  it('NO pregunta si el ciclo ya está cargado', () => {
    const conCiclo = person({ gender: 'female', cycleStartDate: '2026-06-01', ambito: 'personal' })
    expect(selectInlineGap('¿por qué está distante Diana?', [conCiclo], [])).toBeNull()
  })

  it('respeta el descarte (no sé)', () => {
    const g = selectInlineGap('¿por qué está distante Diana?', [diana], [], new Set(['cycle:p1']))
    expect(g).toBeNull()
  })
})

describe('selectInlineGap — cumpleaños', () => {
  it('pregunta el cumple si la consulta es sobre saludo/regalo', () => {
    const ric = person({ id: 'p2', name: 'Ricardo Martinez', relationship: 'professional', importanceScore: 7, birthDate: undefined, ambito: 'lead' })
    const g = selectInlineGap('¿qué le regalo a Ricardo?', [ric], [])
    expect(g?.kind).toBe('birthday')
  })
})

describe('selectInlineGap — próximo paso de objetivo', () => {
  it('pregunta el próximo paso si la consulta es cómo avanzar ese objetivo', () => {
    const mundial = goal({ nextAction: '', isAnchor: true })
    const g = selectInlineGap('¿qué hago para avanzar con el Mundial?', [], [mundial])
    expect(g?.kind).toBe('goal_next_action')
    expect(g?.field).toBe('nextAction')
  })

  it('NO pregunta si el objetivo ya tiene próximo paso', () => {
    const mundial = goal({ nextAction: 'Comprar entradas' })
    expect(selectInlineGap('¿qué hago para avanzar con el Mundial?', [], [mundial])).toBeNull()
  })
})

describe('gapMatchesIntent — gate determinístico', () => {
  it('cycle exige nombre + intención de estado', () => {
    const diana = person({ gender: 'female', cycleStartDate: undefined, ambito: 'personal' })
    const [cycleGap] = selectInlineGap('¿cómo está Diana?', [diana], []) ? [selectInlineGap('¿cómo está Diana?', [diana], [])!] : []
    expect(cycleGap?.kind).toBe('cycle')
    expect(gapMatchesIntent(cycleGap!, '¿cuál es el RUC de Diana?')).toBe(false)
  })
})
