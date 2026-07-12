import { describe, it, expect } from 'vitest'
import { computeNarrativeCoherence, narrativeCoherenceSummaryLine } from './narrativeCoherence'
import type { LifeSeason } from './lifeSeasons'
import type { GoalCategory } from '@/types'

// Helper: arma un LifeSeason mínimo para los tests (solo lo que lee el motor).
function mkSeason(
  id: string,
  cats: GoalCategory[],
  goals: { id: string; title: string; category: GoalCategory }[],
  isCurrent = false,
): LifeSeason {
  return {
    id, startDate: '2026-01-01', endDate: '2026-02-01', spanDays: 31, isCurrent,
    set: goals.length, done: 0, paused: 0, letGo: 0,
    categories: cats.map((category, i) => ({ category, count: cats.length - i })),
    goals: goals.map((g) => ({ ...g, isAnchor: false, events: 1 })),
    label: cats[0] ?? 'x', summary: 'x',
  }
}

describe('computeNarrativeCoherence', () => {
  it('insufficient con 0 o 1 capítulo', () => {
    expect(computeNarrativeCoherence([]).state).toBe('insufficient')
    expect(computeNarrativeCoherence([mkSeason('a', ['career'], [{ id: 'g1', title: 'X', category: 'career' }])]).state).toBe('insufficient')
  })

  it('continuous: un área reaparece en la mayoría de capítulos', () => {
    const seasons = [
      mkSeason('c3', ['career'], [{ id: 'g3', title: 'C', category: 'career' }], true),
      mkSeason('c2', ['career'], [{ id: 'g2', title: 'B', category: 'career' }]),
      mkSeason('c1', ['health'], [{ id: 'g1', title: 'A', category: 'health' }]),
    ]
    const r = computeNarrativeCoherence(seasons, 'career')
    expect(r.state).toBe('continuous')
    expect(r.throughlines[0].category).toBe('career')
    expect(r.throughlines[0].chapters).toBe(2)
    expect(r.currentContinuesPrevious).toBe(true)
    expect(r.message).toContain('hilo')
  })

  it('continuous: un objetivo puente cruza capítulos', () => {
    const g = { id: 'shared', title: 'Mudanza', category: 'personal' as GoalCategory }
    const seasons = [
      mkSeason('c2', ['personal'], [g], true),
      mkSeason('c1', ['personal'], [g]),
    ]
    const r = computeNarrativeCoherence(seasons)
    expect(r.bridgingGoals.length).toBeGreaterThan(0)
    expect(r.bridgingGoals[0].title).toBe('Mudanza')
    expect(r.state).toBe('continuous')
  })

  it('transitioning: el actual pivotea a un tema nuevo pero hay historia', () => {
    const seasons = [
      mkSeason('c3', ['financial'], [{ id: 'g3', title: 'Nuevo', category: 'financial' }], true),
      mkSeason('c2', ['career'], [{ id: 'g2', title: 'B', category: 'career' }]),
      mkSeason('c1', ['career'], [{ id: 'g1', title: 'A', category: 'career' }]),
    ]
    const r = computeNarrativeCoherence(seasons)
    // work es hilo (2 capítulos) pero el actual (finance) NO lo continúa.
    expect(r.currentContinuesPrevious).toBe(false)
    expect(r.state).toBe('transitioning')
    expect(r.message).toContain('transición')
  })

  it('fragmented: cada capítulo un tema distinto, sin recurrencia', () => {
    const seasons = [
      mkSeason('c3', ['financial'], [{ id: 'g3', title: 'C', category: 'financial' }], true),
      mkSeason('c2', ['health'], [{ id: 'g2', title: 'B', category: 'health' }]),
      mkSeason('c1', ['career'], [{ id: 'g1', title: 'A', category: 'career' }]),
    ]
    const r = computeNarrativeCoherence(seasons)
    expect(r.throughlines).toHaveLength(0)
    expect(r.bridgingGoals).toHaveLength(0)
    expect(r.state).toBe('fragmented')
    expect(r.message).toContain('exploración')
  })

  it('summaryLine: null si insufficient, string con sustancia si no', () => {
    expect(narrativeCoherenceSummaryLine(computeNarrativeCoherence([]))).toBeNull()
    const r = computeNarrativeCoherence([
      mkSeason('c2', ['career'], [{ id: 'g2', title: 'B', category: 'career' }], true),
      mkSeason('c1', ['career'], [{ id: 'g1', title: 'A', category: 'career' }]),
    ], 'career')
    const line = narrativeCoherenceSummaryLine(r)
    expect(line).toContain('arco narrativo')
    expect(line).toContain('continuous')
  })
})
