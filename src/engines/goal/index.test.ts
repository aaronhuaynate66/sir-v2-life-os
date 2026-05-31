// SIR V2 — Tests del Goal Engine (riesgo + dashboard + prioridad).
//
// LIVE (/panel, useRichContext). Lógica de fechas (días al deadline) →
// fake timers. Reglas: at-risk con/ sin targetDate, nearDeadline ≤14d,
// completedRecently ≤30d, overallProgress promedio, orden por prioridad.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import type { Goal } from '@/types'
import { detectGoalsAtRisk, buildGoalDashboard, getGoalsByPriority } from './index'

const NOW = new Date('2026-06-01T12:00:00.000Z')
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterEach(() => { vi.useRealTimers() })

function goal(o: Partial<Goal> & { id: string }): Goal {
  return {
    title: o.id,
    description: '',
    category: 'personal',
    priority: 'medium',
    status: 'active',
    progress: 50,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: 5,
    obstacles: [],
    nextAction: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...o,
  }
}

describe('detectGoalsAtRisk', () => {
  it('deadline cercano (<30d) Y progreso < 50 → en riesgo', () => {
    const g = goal({ id: 'g1', targetDate: '2026-06-15', progress: 30 }) // 14d
    expect(detectGoalsAtRisk([g]).map((x) => x.id)).toEqual(['g1'])
  })

  it('deadline cercano pero progreso ≥ 50 → NO en riesgo', () => {
    const g = goal({ id: 'g1', targetDate: '2026-06-15', progress: 80 })
    expect(detectGoalsAtRisk([g])).toHaveLength(0)
  })

  it('deadline lejano (>30d) → NO en riesgo aunque progreso bajo', () => {
    const g = goal({ id: 'g1', targetDate: '2026-12-01', progress: 10 })
    expect(detectGoalsAtRisk([g])).toHaveLength(0)
  })

  it('sin targetDate → en riesgo SÓLO si critical y progreso < 20', () => {
    expect(detectGoalsAtRisk([goal({ id: 'c', priority: 'critical', progress: 10 })]).map((x) => x.id)).toEqual(['c'])
    expect(detectGoalsAtRisk([goal({ id: 'h', priority: 'high', progress: 10 })])).toHaveLength(0)
    expect(detectGoalsAtRisk([goal({ id: 'c2', priority: 'critical', progress: 25 })])).toHaveLength(0)
  })

  it('goals no activos quedan fuera', () => {
    const g = goal({ id: 'g1', status: 'paused', targetDate: '2026-06-10', progress: 10 })
    expect(detectGoalsAtRisk([g])).toHaveLength(0)
  })
})

describe('buildGoalDashboard', () => {
  it('overallProgress = promedio (redondeado) de los activos', () => {
    const d = buildGoalDashboard([goal({ id: 'a', progress: 40 }), goal({ id: 'b', progress: 70 }), goal({ id: 'c', status: 'completed', progress: 100 })])
    expect(d.overallProgress).toBe(55) // (40+70)/2, el completado no cuenta
    expect(d.activeGoals).toHaveLength(2)
  })

  it('sin activos → overallProgress 0', () => {
    expect(buildGoalDashboard([goal({ id: 'c', status: 'completed' })]).overallProgress).toBe(0)
  })

  it('nearDeadline ≤14d; completedRecently ≤30d por updatedAt', () => {
    const d = buildGoalDashboard([
      goal({ id: 'near', targetDate: '2026-06-10', progress: 60 }), // 9d
      goal({ id: 'far', targetDate: '2026-08-01', progress: 60 }),
      goal({ id: 'recent', status: 'completed', updatedAt: '2026-05-20T00:00:00.000Z' }), // 12d
      goal({ id: 'old', status: 'completed', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ])
    expect(d.nearDeadline.map((g) => g.id)).toEqual(['near'])
    expect(d.completedRecently.map((g) => g.id)).toEqual(['recent'])
  })
})

describe('getGoalsByPriority', () => {
  it('ordena critical < high < medium < low y excluye no activos', () => {
    const out = getGoalsByPriority([
      goal({ id: 'low', priority: 'low' }),
      goal({ id: 'crit', priority: 'critical' }),
      goal({ id: 'done', priority: 'critical', status: 'completed' }),
      goal({ id: 'med', priority: 'medium' }),
    ])
    expect(out.map((g) => g.id)).toEqual(['crit', 'med', 'low'])
  })
})
