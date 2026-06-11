import { describe, it, expect } from 'vitest'
import { buildLifeThread } from './lifeThread'
import type { Goal } from '@/types'

const g = (o: Partial<Goal> & { id: string; title: string }): Goal =>
  ({ category: 'career', priority: 'high', status: 'active', milestones: [], relatedGoals: [], relatedPersons: [], peaceImpact: 5, obstacles: [], nextAction: '', progress: 0, createdAt: o.createdAt ?? '2026-01-01T00:00:00Z', updatedAt: o.updatedAt ?? o.createdAt ?? '2026-01-01T00:00:00Z', ...o }) as Goal
const NOW = new Date('2026-06-11T12:00:00Z')

describe('buildLifeThread', () => {
  it('objetivo activo → solo hito de partida (set)', () => {
    const t = buildLifeThread([g({ id: 'a', title: 'Activo', createdAt: '2026-06-01T00:00:00Z' })], NOW)
    expect(t.map((m) => m.kind)).toEqual(['set'])
    expect(t[0].label).toBe('Te propusiste “Activo”')
  })

  it('completado → set + done (done usa updatedAt)', () => {
    const t = buildLifeThread([g({ id: 'b', title: 'Logrado', status: 'completed', createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-06-05T00:00:00Z' })], NOW)
    expect(t.map((m) => m.kind)).toEqual(['done', 'set'])
    expect(t.find((m) => m.kind === 'done')?.date).toBe('2026-06-05T00:00:00Z')
  })

  it('pausado y abandonado generan sus hitos', () => {
    const tp = buildLifeThread([g({ id: 'c', title: 'P', status: 'paused', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-05-20T00:00:00Z' })], NOW)
    expect(tp.some((m) => m.kind === 'paused')).toBe(true)
    const ta = buildLifeThread([g({ id: 'd', title: 'A', status: 'abandoned', createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-04-10T00:00:00Z' })], NOW)
    expect(ta.some((m) => m.kind === 'let_go')).toBe(true)
  })

  it('título vacío se descarta; orden descendente por fecha', () => {
    const t = buildLifeThread([
      g({ id: 'e', title: '  ', createdAt: '2026-06-01T00:00:00Z' }),
      g({ id: 'x', title: 'Viejo', createdAt: '2026-01-01T00:00:00Z' }),
      g({ id: 'y', title: 'Nuevo', createdAt: '2026-06-09T00:00:00Z' }),
    ], NOW)
    expect(t.every((m) => m.title !== '')).toBe(true)
    expect(t[0].title).toBe('Nuevo')
  })
})
