// SIR V2 — Tests del agregador AnduveHoy.

import { describe, it, expect } from 'vitest'
import { buildAnduveTimeline, type AnduveInput } from './anduveHoy'
import type { FinancialMovement, Goal, ObjectiveStep, Person, SelfMetric, SleepRecord } from '@/types'

const NOW = new Date(2026, 6, 1, 15, 0, 0) // mié 1 jul 2026 · 15:00

function makeInput(patch: Partial<AnduveInput> = {}): AnduveInput {
  return {
    now: NOW,
    goals: [],
    people: [],
    objectiveSteps: [],
    selfMetrics: [],
    sleepRecords: [],
    financialMovements: [],
    memories: [],
    habitCheckins: [],
    ...patch,
  }
}

describe('buildAnduveTimeline — filtros por día', () => {
  it('devuelve [] cuando no hay nada de hoy', () => {
    expect(buildAnduveTimeline(makeInput())).toEqual([])
  })

  it('ignora eventos que no son de hoy', () => {
    const sm: SelfMetric = {
      id: 'sm1', category: 'energy', value: 8,
      timestamp: new Date(2026, 5, 30, 10, 0, 0).toISOString(), // ayer
    }
    expect(buildAnduveTimeline(makeInput({ selfMetrics: [sm] }))).toEqual([])
  })

  it('incluye self-metric del día', () => {
    const sm: SelfMetric = {
      id: 'sm1', category: 'energy', value: 8,
      timestamp: new Date(2026, 6, 1, 10, 0, 0).toISOString(),
    }
    const events = buildAnduveTimeline(makeInput({ selfMetrics: [sm] }))
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('metric')
    expect(events[0].label).toBe('Energía')
    expect(events[0].meta).toBe('8/10')
  })
})

describe('buildAnduveTimeline — orden y merge', () => {
  it('ordena por at DESC (más reciente primero)', () => {
    const sm1: SelfMetric = { id: 'sm1', category: 'mood', value: 7, timestamp: new Date(2026, 6, 1, 9, 0, 0).toISOString() }
    const sm2: SelfMetric = { id: 'sm2', category: 'stress', value: 6, timestamp: new Date(2026, 6, 1, 14, 0, 0).toISOString() }
    const events = buildAnduveTimeline(makeInput({ selfMetrics: [sm1, sm2] }))
    expect(events.map((e) => e.id)).toEqual(['sm:sm2', 'sm:sm1'])
  })

  it('no duplica goal_touched si ya hay un step_done del mismo goal', () => {
    const goal: Goal = {
      id: 'g1', title: 'X', description: '', category: 'personal', priority: 'medium',
      status: 'active', progress: 0, milestones: [], relatedGoals: [], relatedPersons: [],
      peaceImpact: 5, obstacles: [], nextAction: '',
      createdAt: '', updatedAt: new Date(2026, 6, 1, 10, 0, 0).toISOString(),
    }
    const step: ObjectiveStep = {
      id: 's1', objectiveId: 'g1', kind: 'task', title: 'Sub-tarea',
      status: 'hecho', order: 0, createdAt: '',
      completedAt: new Date(2026, 6, 1, 11, 0, 0).toISOString(),
    }
    const events = buildAnduveTimeline(makeInput({ goals: [goal], objectiveSteps: [step] }))
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('task_done')
  })
})

describe('buildAnduveTimeline — finanzas + sueño + hábito', () => {
  it('mapea sign + intent en finance', () => {
    const f: FinancialMovement = {
      id: 'f1', type: 'expense', amount: 45, currency: 'PEN', exchangeRate: 1, amountPEN: 45,
      category: 'personal', intent: 'no_esencial', description: 'Rappi',
      date: '2026-07-01', recurrent: false, tags: [],
    }
    const events = buildAnduveTimeline(makeInput({ financialMovements: [f] }))
    expect(events).toHaveLength(1)
    expect(events[0].label).toBe('Rappi')
    expect(events[0].meta).toContain('-S/45')
    expect(events[0].meta).toContain('no_esencial')
  })

  it('mapea sueño con h + calidad', () => {
    const s: SleepRecord = {
      id: 's1', date: '2026-07-01', bedtime: '23:00', wakeTime: '07:00',
      duration: 6.2, quality: 7,
    }
    const events = buildAnduveTimeline(makeInput({ sleepRecords: [s] }))
    expect(events).toHaveLength(1)
    expect(events[0].label).toBe('Sueño')
    expect(events[0].meta).toBe('6.2h · calidad 7/10')
  })

  it('mapea hábito checkin', () => {
    const events = buildAnduveTimeline(makeInput({
      habitCheckins: [{ id: 'hc1', title: 'meditar', at: new Date(2026, 6, 1, 7, 0, 0).toISOString() }],
    }))
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('habit')
    expect(events[0].label).toBe('Hábito · meditar')
  })
})
