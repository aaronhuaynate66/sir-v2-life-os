import { describe, it, expect } from 'vitest'

import { contactDays, gapsBetweenDays } from './contactRhythm'

const DAY = 86_400_000
const NOW = 100 * DAY

describe('contactDays', () => {
  it('colapsa varios logs del mismo día a uno', () => {
    const ms = [10 * DAY + 3600_000, 10 * DAY + 7200_000, 12 * DAY]
    expect(contactDays(ms, NOW)).toEqual([10, 12])
  })

  it('descarta futuros e inválidos, ordena asc', () => {
    expect(contactDays([12 * DAY, 5 * DAY, 200 * DAY, NaN, null], NOW)).toEqual([5, 12])
  })

  it('vacío si no hay ninguno válido', () => {
    expect(contactDays([300 * DAY, null], NOW)).toEqual([])
  })
})

describe('gapsBetweenDays', () => {
  it('diferencias entre días consecutivos', () => {
    expect(gapsBetweenDays([5, 12, 14])).toEqual([7, 2])
  })
  it('vacío con menos de 2 días', () => {
    expect(gapsBetweenDays([5])).toEqual([])
    expect(gapsBetweenDays([])).toEqual([])
  })
})
