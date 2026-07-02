import { describe, it, expect } from 'vitest'
import { urgencyOf } from '@/lib/moments/urgency'

describe('urgencyOf', () => {
  const today = '2026-07-02'

  it('sin follow-up → sinFecha, delta null', () => {
    expect(urgencyOf(null, today)).toEqual({ urgency: 'sinFecha', deltaDays: null })
  })

  it('follow-up hoy → dueSoon 0', () => {
    expect(urgencyOf('2026-07-02', today)).toEqual({ urgency: 'dueSoon', deltaDays: 0 })
  })

  it('follow-up mañana → dueSoon 1', () => {
    expect(urgencyOf('2026-07-03', today)).toEqual({ urgency: 'dueSoon', deltaDays: 1 })
  })

  it('follow-up en 3 días → dueSoon 3 (borde)', () => {
    expect(urgencyOf('2026-07-05', today)).toEqual({ urgency: 'dueSoon', deltaDays: 3 })
  })

  it('follow-up en 4 días → later 4 (fuera del borde)', () => {
    expect(urgencyOf('2026-07-06', today)).toEqual({ urgency: 'later', deltaDays: 4 })
  })

  it('follow-up en 30 días → later', () => {
    expect(urgencyOf('2026-08-01', today).urgency).toBe('later')
  })

  it('follow-up ayer → overdue -1', () => {
    expect(urgencyOf('2026-07-01', today)).toEqual({ urgency: 'overdue', deltaDays: -1 })
  })

  it('follow-up 7 días atrás → overdue -7', () => {
    expect(urgencyOf('2026-06-25', today)).toEqual({ urgency: 'overdue', deltaDays: -7 })
  })

  it('acepta ISO datetime → toma solo YYYY-MM-DD', () => {
    expect(urgencyOf('2026-07-02T18:30:00-05:00', today).urgency).toBe('dueSoon')
  })
})
