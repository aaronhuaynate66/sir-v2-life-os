// SIR V2 — Tests de la selección/cómputo del WeekInFocus (panel).

import { describe, it, expect } from 'vitest'
import { pickWeekFocusGoal, buildWeekFocus, countdownLabel } from './weekInFocus'
import type { Goal, ObjectiveStep } from '@/types'

function makeGoal(patch: Partial<Goal>): Goal {
  return {
    id: 'g_test',
    title: 'test',
    description: '',
    category: 'personal',
    priority: 'medium',
    status: 'active',
    progress: 0,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: 5,
    obstacles: [],
    nextAction: '',
    createdAt: '2026-06-30T00:00:00Z',
    updatedAt: '2026-06-30T00:00:00Z',
    ...patch,
  }
}

const NOW = new Date(2026, 6, 1) // mié 1 jul 2026

describe('pickWeekFocusGoal', () => {
  it('elige el goal activo con targetDate más próximo', () => {
    const goals: Goal[] = [
      makeGoal({ id: 'a', title: 'mudanza', targetDate: '2026-07-04' }), // sáb, 3d
      makeGoal({ id: 'b', title: 'mundial', targetDate: '2026-11-07' }), // 129d
      makeGoal({ id: 'c', title: 'lejano', targetDate: '2026-08-15' }), // 45d
    ]
    expect(pickWeekFocusGoal(goals, NOW)?.id).toBe('a')
  })

  it('ignora goals no-activos', () => {
    const goals: Goal[] = [
      makeGoal({ id: 'done', title: 'x', targetDate: '2026-07-03', status: 'completed' }),
      makeGoal({ id: 'paused', title: 'y', targetDate: '2026-07-04', status: 'paused' }),
      makeGoal({ id: 'active', title: 'z', targetDate: '2026-07-05' }),
    ]
    expect(pickWeekFocusGoal(goals, NOW)?.id).toBe('active')
  })

  it('null cuando ningún activo está en la ventana', () => {
    const goals: Goal[] = [
      makeGoal({ id: 'far', title: 'lejano', targetDate: '2027-01-01' }),
    ]
    expect(pickWeekFocusGoal(goals, NOW)).toBeNull()
  })

  it('null cuando no hay goals', () => {
    expect(pickWeekFocusGoal([], NOW)).toBeNull()
  })

  it('incluye goals recién vencidos (hasta 7d atrás)', () => {
    const goals: Goal[] = [
      makeGoal({ id: 'vencido_ayer', title: 'x', targetDate: '2026-06-30' }),
    ]
    expect(pickWeekFocusGoal(goals, NOW)?.id).toBe('vencido_ayer')
  })

  it('no incluye goals muy vencidos (>7d atrás)', () => {
    const goals: Goal[] = [
      makeGoal({ id: 'muy_viejo', title: 'x', targetDate: '2026-06-10' }),
    ]
    expect(pickWeekFocusGoal(goals, NOW)).toBeNull()
  })

  it('desempate: alta > media > baja cuando misma fecha', () => {
    const goals: Goal[] = [
      makeGoal({ id: 'low', title: 'x', targetDate: '2026-07-04', priority: 'low' }),
      makeGoal({ id: 'high', title: 'y', targetDate: '2026-07-04', priority: 'high' }),
      makeGoal({ id: 'med', title: 'z', targetDate: '2026-07-04', priority: 'medium' }),
    ]
    expect(pickWeekFocusGoal(goals, NOW)?.id).toBe('high')
  })

  it('desempate: ancla del año gana sobre no-ancla con misma fecha', () => {
    const goals: Goal[] = [
      makeGoal({ id: 'x', title: 'x', targetDate: '2026-07-04', priority: 'high' }),
      makeGoal({ id: 'anc', title: 'ancla', targetDate: '2026-07-04', priority: 'medium', isAnchor: true }),
    ]
    expect(pickWeekFocusGoal(goals, NOW)?.id).toBe('anc')
  })
})

describe('buildWeekFocus', () => {
  it('cuenta KRs hechos y pendientes', () => {
    const goal = makeGoal({ id: 'g', title: 'mudanza', targetDate: '2026-07-04' })
    const steps: ObjectiveStep[] = [
      { id: 'k1', objectiveId: 'g', kind: 'key_result', title: 'KR1', status: 'hecho', order: 0, createdAt: '' },
      { id: 'k2', objectiveId: 'g', kind: 'key_result', title: 'KR2', status: 'pendiente', order: 1, createdAt: '' },
      { id: 'k3', objectiveId: 'g', kind: 'key_result', title: 'KR3', status: 'hecho', order: 2, createdAt: '' },
      { id: 'k4', objectiveId: 'g', kind: 'key_result', title: 'KR4', status: 'en_progreso', order: 3, createdAt: '' },
      // Ruido: tareas no van al KR list.
      { id: 't1', objectiveId: 'g', kind: 'task', title: 'sub-tarea', status: 'pendiente', order: 0, createdAt: '', parentId: 'k1' },
      // Ruido: KR de otro goal.
      { id: 'k_other', objectiveId: 'x', kind: 'key_result', title: 'no', status: 'hecho', order: 0, createdAt: '' },
    ]
    const focus = buildWeekFocus(goal, steps, NOW)
    expect(focus.krs).toHaveLength(4)
    expect(focus.krProgress).toEqual({ done: 2, total: 4 })
    expect(focus.daysUntil).toBe(3) // 4 jul - 1 jul
    expect(focus.targetDate).toBe('2026-07-04')
    expect(focus.isAnchor).toBe(false)
  })

  it('KRs ordenados por order', () => {
    const goal = makeGoal({ id: 'g', targetDate: '2026-07-04' })
    const steps: ObjectiveStep[] = [
      { id: 'k3', objectiveId: 'g', kind: 'key_result', title: 'C', status: 'pendiente', order: 2, createdAt: '' },
      { id: 'k1', objectiveId: 'g', kind: 'key_result', title: 'A', status: 'pendiente', order: 0, createdAt: '' },
      { id: 'k2', objectiveId: 'g', kind: 'key_result', title: 'B', status: 'pendiente', order: 1, createdAt: '' },
    ]
    const focus = buildWeekFocus(goal, steps, NOW)
    expect(focus.krs.map((k) => k.title)).toEqual(['A', 'B', 'C'])
  })

  it('respeta isAnchor', () => {
    const goal = makeGoal({ id: 'g', targetDate: '2026-11-07', isAnchor: true })
    const focus = buildWeekFocus(goal, [], NOW)
    expect(focus.isAnchor).toBe(true)
    expect(focus.daysUntil).toBe(129)
  })
})

describe('countdownLabel', () => {
  it('mapea 0/1/-1 a copy natural', () => {
    expect(countdownLabel(0)).toBe('HOY')
    expect(countdownLabel(1)).toBe('MAÑANA')
    expect(countdownLabel(-1)).toBe('AYER')
  })
  it('mapea futuro y pasado', () => {
    expect(countdownLabel(3)).toBe('EN 3 DÍAS')
    expect(countdownLabel(-2)).toBe('HACE 2 DÍAS')
  })
})
