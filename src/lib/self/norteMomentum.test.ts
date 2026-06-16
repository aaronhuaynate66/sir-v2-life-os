import { describe, it, expect } from 'vitest'
import { computeNorteMomentum } from './norteMomentum'
import type { Goal, ObjectiveStep } from '@/types'

const NOW = new Date('2026-06-15T12:00:00Z')
function goal(o: Partial<Goal>): Goal {
  return { id: 'g', title: 'Obj', description: '', category: 'personal', priority: 'high', status: 'active', progress: 0, milestones: [], relatedGoals: [], relatedPersons: [], peaceImpact: 5, obstacles: [], nextAction: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-06-14T00:00:00Z', ...o } as Goal
}
function step(o: Partial<ObjectiveStep>): ObjectiveStep {
  return { id: 's'+Math.random(), objectiveId: 'g', kind: 'task', title: 't', status: 'hecho', order: 0, createdAt: '2026-01-01T00:00:00Z', ...o } as ObjectiveStep
}

describe('computeNorteMomentum', () => {
  it('sin_norte si no hay ancla', () => {
    const r = computeNorteMomentum([goal({ id: 'g' })], [], NOW)
    expect(r.efficacy).toBe('sin_norte')
  })
  it('eficacia avanzando: pasos del norte completados en 30d', () => {
    const anchor = goal({ id: 'n', isAnchor: true, title: 'Mundial' })
    const r = computeNorteMomentum([anchor], [step({ objectiveId: 'n', completedAt: '2026-06-10T00:00:00Z' })], NOW)
    expect(r.efficacy).toBe('avanzando')
    expect(r.norteStepsDone30d).toBe(1)
    expect(r.norteMonthDone).toBe(1)
  })
  it('sin_avances: norte sin pasos completados en 30d', () => {
    const anchor = goal({ id: 'n', isAnchor: true })
    const r = computeNorteMomentum([anchor], [step({ objectiveId: 'n', completedAt: '2026-04-01T00:00:00Z' })], NOW)
    expect(r.efficacy).toBe('sin_avances')
    expect(r.norteStepsDone30d).toBe(0)
  })
  it('cadencia mejor/peor: este mes vs anterior (cualquier objetivo)', () => {
    const anchor = goal({ id: 'n', isAnchor: true })
    const steps = [
      step({ objectiveId: 'n', completedAt: '2026-06-05T00:00:00Z' }),
      step({ objectiveId: 'x', completedAt: '2026-06-09T00:00:00Z' }),
      step({ objectiveId: 'x', completedAt: '2026-05-20T00:00:00Z' }),
    ]
    const r = computeNorteMomentum([anchor], steps, NOW)
    expect(r.monthDone).toBe(2)
    expect(r.prevMonthDone).toBe(1)
    expect(r.cadence).toBe('mejor')
  })
  it('ignora pasos no completados y sin completedAt', () => {
    const anchor = goal({ id: 'n', isAnchor: true })
    const steps = [step({ objectiveId: 'n', status: 'pendiente' }), step({ objectiveId: 'n', completedAt: undefined })]
    const r = computeNorteMomentum([anchor], steps, NOW)
    expect(r.monthDone).toBe(0)
  })
})
