// SIR V2 — Tests del WeeklyDelta.

import { describe, it, expect } from 'vitest'
import { computeWeeklyDelta } from './delta'
import type { WeeklyScore } from './index'

function makeScored(score: number, tier: WeeklyScore['tier']): WeeklyScore {
  return {
    status: 'scored',
    score,
    tier,
    components: [],
    daysWithData: 5,
    windowDays: 7,
    confident: true,
  }
}

const calibrating: WeeklyScore = {
  status: 'calibrating',
  score: 0,
  tier: 'C',
  components: [],
  daysWithData: 0,
  windowDays: 7,
  confident: false,
}

describe('computeWeeklyDelta', () => {
  it('no_comparison cuando alguna semana está calibrando', () => {
    const r = computeWeeklyDelta(makeScored(70, 'B'), calibrating)
    expect(r.direction).toBe('no_comparison')
    expect(r.scorePoints).toBeNull()
  })

  it('sube de tier B → A cuando score sube 15 pts', () => {
    const r = computeWeeklyDelta(makeScored(75, 'A'), makeScored(60, 'B'))
    expect(r.direction).toBe('up')
    expect(r.scorePoints).toBe(15)
    expect(r.tierChange).toBe('up')
    expect(r.label).toBe('Subiste de B a A.')
  })

  it('baja de tier B → C', () => {
    const r = computeWeeklyDelta(makeScored(52, 'C'), makeScored(68, 'B'))
    expect(r.direction).toBe('down')
    expect(r.tierChange).toBe('down')
    expect(r.label).toBe('Bajaste de B a C.')
  })

  it('flat dentro del tier (±2 pts)', () => {
    const r = computeWeeklyDelta(makeScored(72, 'B'), makeScored(71, 'B'))
    expect(r.direction).toBe('flat')
    expect(r.tierChange).toBe('same')
    expect(r.label).toBe('Sostuviste el tier B.')
  })

  it('subió dentro del mismo tier', () => {
    const r = computeWeeklyDelta(makeScored(74, 'B'), makeScored(65, 'B'))
    expect(r.direction).toBe('up')
    expect(r.tierChange).toBe('same')
    expect(r.label).toBe('Subiste 9 pts dentro del tier.')
  })

  it('bajó dentro del mismo tier', () => {
    const r = computeWeeklyDelta(makeScored(65, 'B'), makeScored(74, 'B'))
    expect(r.direction).toBe('down')
    expect(r.label).toBe('Bajaste 9 pts dentro del tier.')
  })
})
