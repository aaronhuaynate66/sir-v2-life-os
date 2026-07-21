import { describe, it, expect } from 'vitest'
import { stalledGoals } from './stalled'
import type { Goal } from '@/types'

const NOW = new Date('2026-07-21T12:00:00Z')
const g = (o: Partial<Goal> & { id: string; title: string }): Goal => ({
  description: '', category: 'personal', priority: 'medium', status: 'active',
  progress: 0, nextAction: '', peaceImpact: 5, relatedPersons: [], relatedGoals: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: NOW.toISOString(),
  ...o,
} as Goal)

describe('stalledGoals', () => {
  it('marca activos sin tocar ≥14 días', () => {
    const r = stalledGoals([g({ id: '1', title: 'Viejo', updatedAt: '2026-07-01T12:00:00Z' })], NOW)
    expect(r).toHaveLength(1)
    expect(r[0].daysSinceTouch).toBe(20)
  })
  it('ignora los tocados hace poco', () => {
    expect(stalledGoals([g({ id: '1', title: 'Fresco', updatedAt: '2026-07-18T12:00:00Z' })], NOW)).toHaveLength(0)
  })
  it('ignora pausados/completados/abandonados y los que ya van 100%', () => {
    const old = '2026-06-01T12:00:00Z'
    const r = stalledGoals([
      g({ id: '1', title: 'Pausado', status: 'paused', updatedAt: old }),
      g({ id: '2', title: 'Completado', status: 'completed', updatedAt: old }),
      g({ id: '3', title: 'Al 100', progress: 100, updatedAt: old }),
    ], NOW)
    expect(r).toHaveLength(0)
  })
  it('el norte estancado va primero, luego por más días', () => {
    const r = stalledGoals([
      g({ id: 'a', title: 'A', updatedAt: '2026-06-01T12:00:00Z' }),        // 50d
      g({ id: 'norte', title: 'Norte', isAnchor: true, updatedAt: '2026-07-05T12:00:00Z' }), // 16d
    ], NOW)
    expect(r[0].goal.id).toBe('norte')
    expect(r[1].goal.id).toBe('a')
  })
})
