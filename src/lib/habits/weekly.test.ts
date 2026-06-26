import { describe, it, expect } from 'vitest'
import { computeWeeklyStreak } from './weekly'

// Miércoles 2026-06-24 (UTC). Lunes de esa semana = 2026-06-22.
const WED = new Date('2026-06-24T12:00:00Z')

describe('computeWeeklyStreak', () => {
  it('cuenta cumplidos de la semana actual', () => {
    const r = computeWeeklyStreak(['2026-06-22', '2026-06-24'], 3, WED)
    expect(r.thisWeek).toBe(2)
    expect(r.target).toBe(3)
    expect(r.doneToday).toBe(true)
  })
  it('semana actual no llegó al target → no rompe racha previa', () => {
    // Semana pasada (15-21) llegó 3x; esta semana 1 → racha = 1 (la pasada)
    const r = computeWeeklyStreak(['2026-06-15', '2026-06-17', '2026-06-19', '2026-06-22'], 3, WED)
    expect(r.weeksStreak).toBe(1)
  })
  it('semana actual llegó al target → la cuenta en la racha', () => {
    const r = computeWeeklyStreak(['2026-06-15', '2026-06-17', '2026-06-19', '2026-06-22', '2026-06-23', '2026-06-24'], 3, WED)
    expect(r.weeksStreak).toBe(2)
  })
  it('consistencia = semanas que llegaron / ventana', () => {
    const r = computeWeeklyStreak(['2026-06-22', '2026-06-23', '2026-06-24'], 3, WED, 8)
    expect(r.consistency).toBe(Math.round((1 / 8) * 100))
  })
  it('sin checkins → todo en cero', () => {
    expect(computeWeeklyStreak([], 3, WED)).toEqual({ thisWeek: 0, target: 3, weeksStreak: 0, consistency: 0, doneToday: false })
  })
})
