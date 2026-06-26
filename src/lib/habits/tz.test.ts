import { describe, it, expect } from 'vitest'
import { limaDayString, computeHabitStreak, recentDayMarks } from './streak'

describe('día de Lima (UTC-5) en hábitos', () => {
  it('23:02 Lima del 25 (=04:02Z del 26) bucketea como 2026-06-25, no 26', () => {
    expect(limaDayString(new Date('2026-06-26T04:02:00Z'))).toBe('2026-06-25')
  })
  it('11:17 Lima del 26 (=16:17Z) es 2026-06-26', () => {
    expect(limaDayString(new Date('2026-06-26T16:17:00Z'))).toBe('2026-06-26')
  })
  it('a las 11:17 del 26, un check del 25 NO cuenta como hoy', () => {
    const now = new Date('2026-06-26T16:17:00Z')
    const s = computeHabitStreak(['2026-06-25'], now)
    expect(s.doneToday).toBe(false)
    expect(s.current).toBe(1) // ayer cuenta para la racha
    const marks = recentDayMarks(['2026-06-25'], now, 7)
    expect(marks[6]).toMatchObject({ iso: '2026-06-26', isToday: true, done: false })
    expect(marks[5]).toMatchObject({ iso: '2026-06-25', done: true })
  })
})
