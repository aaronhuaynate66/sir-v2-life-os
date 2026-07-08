// SIR V2 — Tests del reducer del scrub del ciclo.

import { describe, it, expect } from 'vitest'
import { scrubReducer, effectiveDate, initialScrub } from './cycleScrub'

describe('scrubReducer', () => {
  it('date → modo whatif, sin evento', () => {
    const s = scrubReducer(initialScrub, { t: 'date', iso: '2026-12-25' })
    expect(s).toEqual({ selectedDate: '2026-12-25', mode: 'whatif', selectedEventId: null })
  })
  it('event → modo event con id', () => {
    const s = scrubReducer(initialScrub, { t: 'event', iso: '2026-07-18', id: 'ev1' })
    expect(s).toEqual({ selectedDate: '2026-07-18', mode: 'event', selectedEventId: 'ev1' })
  })
  it('today → resetea a la selección inicial', () => {
    const mid = scrubReducer(initialScrub, { t: 'date', iso: '2026-12-25' })
    expect(scrubReducer(mid, { t: 'today' })).toEqual(initialScrub)
  })
  it('ignora fechas inválidas (no rompe el estado)', () => {
    const s = scrubReducer(initialScrub, { t: 'date', iso: 'nope' })
    expect(s).toBe(initialScrub)
  })
  it('event sin id se ignora', () => {
    const s = scrubReducer(initialScrub, { t: 'event', iso: '2026-07-18', id: '' })
    expect(s).toBe(initialScrub)
  })
})

describe('effectiveDate', () => {
  it('usa hoy si no hay selección', () => {
    expect(effectiveDate(initialScrub, '2026-07-08')).toBe('2026-07-08')
  })
  it('usa la fecha seleccionada', () => {
    const s = scrubReducer(initialScrub, { t: 'date', iso: '2026-12-25' })
    expect(effectiveDate(s, '2026-07-08')).toBe('2026-12-25')
  })
})
