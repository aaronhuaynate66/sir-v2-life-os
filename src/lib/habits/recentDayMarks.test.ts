import { describe, it, expect } from 'vitest'
import { recentDayMarks } from './streak'

describe('recentDayMarks', () => {
  const today = new Date('2026-06-15T12:00:00Z')
  it('marca hoy y días marcados', () => {
    const r = recentDayMarks(['2026-06-15', '2026-06-13', '2026-06-09'], today, 7)
    expect(r.length).toBe(7)
    expect(r[6]).toMatchObject({ iso: '2026-06-15', done: true, isToday: true })
    expect(r[4]).toMatchObject({ iso: '2026-06-13', done: true, isToday: false })
    expect(r[5]).toMatchObject({ iso: '2026-06-14', done: false })
  })
  it('hoy sin marcar', () => {
    const r = recentDayMarks(['2026-06-14', '2026-06-13'], today, 7)
    expect(r[6]).toMatchObject({ isToday: true, done: false })
  })
})
