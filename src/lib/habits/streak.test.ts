import { describe, it, expect } from 'vitest'
import { computeHabitStreak } from './streak'

const TODAY = new Date('2026-06-08T12:00:00Z')

describe('computeHabitStreak', () => {
  it('sin checkins → todo en cero', () => {
    const r = computeHabitStreak([], TODAY)
    expect(r).toEqual({ current: 0, longest: 0, consistency: 0, doneToday: false })
  })

  it('cumplido hoy + 2 días previos → racha 3, doneToday true', () => {
    const r = computeHabitStreak(['2026-06-06', '2026-06-07', '2026-06-08'], TODAY)
    expect(r.current).toBe(3)
    expect(r.longest).toBe(3)
    expect(r.doneToday).toBe(true)
  })

  it('cumplido ayer pero no hoy → racha sigue viva (ayer ancla), doneToday false', () => {
    const r = computeHabitStreak(['2026-06-06', '2026-06-07'], TODAY)
    expect(r.current).toBe(2)
    expect(r.doneToday).toBe(false)
  })

  it('último checkin anteayer → racha actual 0 (se rompió)', () => {
    const r = computeHabitStreak(['2026-06-05', '2026-06-06'], TODAY)
    expect(r.current).toBe(0)
    expect(r.longest).toBe(2)
  })

  it('racha más larga histórica distinta de la actual', () => {
    const r = computeHabitStreak(
      ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-06-07', '2026-06-08'],
      TODAY,
    )
    expect(r.longest).toBe(4)
    expect(r.current).toBe(2)
  })

  it('consistencia: 15 de 30 días → 50%', () => {
    const dates: string[] = []
    for (let i = 0; i < 15; i++) {
      const d = new Date(Date.UTC(2026, 5, 8) - i * 2 * 86400000)
      dates.push(d.toISOString().slice(0, 10))
    }
    const r = computeHabitStreak(dates, TODAY, 30)
    expect(r.consistency).toBe(50)
  })

  it('ignora fechas inválidas y duplicados', () => {
    const r = computeHabitStreak(['2026-06-08', '2026-06-08', 'bad-date', ''], TODAY)
    expect(r.current).toBe(1)
    expect(r.doneToday).toBe(true)
  })

  it('consistencia se topa en checkins dentro de la ventana, no fuera', () => {
    const r = computeHabitStreak(['2026-01-01', '2026-06-08'], TODAY, 30)
    expect(r.consistency).toBe(Math.round((1 / 30) * 100))
  })
})
