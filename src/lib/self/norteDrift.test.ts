import { describe, it, expect } from 'vitest'
import { computeNorteDrift } from './norteDrift'
import type { Goal } from '@/types'

const NOW = new Date('2026-06-15T12:00:00Z')
function goal(over: Partial<Goal>): Goal {
  return {
    id: 'g', title: 'Obj', description: '', category: 'personal', priority: 'high',
    status: 'active', progress: 0, milestones: [], relatedGoals: [], relatedPersons: [],
    peaceImpact: 5, obstacles: [], nextAction: '', createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-06-14T00:00:00Z', ...over,
  } as Goal
}

describe('computeNorteDrift', () => {
  it('sin_norte si no hay ancla', () => {
    expect(computeNorteDrift([goal({ id: 'a' })], NOW).state).toBe('sin_norte')
  })
  it('enfocado: norte tocado hace poco, pocos frentes', () => {
    const r = computeNorteDrift([goal({ id: 'n', isAnchor: true, title: 'Mundial', updatedAt: '2026-06-13T00:00:00Z' })], NOW)
    expect(r.state).toBe('enfocado')
    expect(r.norteTitle).toBe('Mundial')
  })
  it('estancado: norte sin tocar > 45 días', () => {
    const r = computeNorteDrift([goal({ id: 'n', isAnchor: true, updatedAt: '2026-04-01T00:00:00Z' })], NOW)
    expect(r.state).toBe('estancado')
  })
  it('disperso: muchos frentes recientes + norte atrasado', () => {
    const others = ['a', 'b', 'c'].map((id) => goal({ id, updatedAt: '2026-06-12T00:00:00Z' }))
    const anchor = goal({ id: 'n', isAnchor: true, updatedAt: '2026-05-20T00:00:00Z' })
    expect(computeNorteDrift([anchor, ...others], NOW).state).toBe('disperso')
  })
  it('cuenta activeOthers y othersMovedRecently', () => {
    const r = computeNorteDrift([
      goal({ id: 'n', isAnchor: true, updatedAt: '2026-06-14T00:00:00Z' }),
      goal({ id: 'a', updatedAt: '2026-06-13T00:00:00Z' }),
      goal({ id: 'b', updatedAt: '2026-01-01T00:00:00Z' }),
      goal({ id: 'c', status: 'paused' }),
    ], NOW)
    expect(r.activeOthers).toBe(2)
    expect(r.othersMovedRecently).toBe(1)
  })
})
