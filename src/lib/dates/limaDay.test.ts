import { describe, it, expect } from 'vitest'
import { limaDayKey, todayLimaKey } from './limaDay'

describe('limaDayKey', () => {
  it('22:28 Lima (03:28 UTC del día siguiente) → el día de Lima, no el UTC', () => {
    // 2026-06-19T03:28Z === 2026-06-18 22:28 en Lima
    expect(limaDayKey('2026-06-19T03:28:00.000Z')).toBe('2026-06-18')
  })
  it('mediodía no cambia de día', () => {
    expect(limaDayKey('2026-06-18T17:00:00.000Z')).toBe('2026-06-18') // 12:00 Lima
  })
  it('date-only se devuelve igual (no resta offset)', () => {
    expect(limaDayKey('2026-06-18')).toBe('2026-06-18')
  })
  it('basura → null', () => {
    expect(limaDayKey('nope')).toBeNull()
    expect(limaDayKey(null)).toBeNull()
  })
})

describe('todayLimaKey', () => {
  it('usa la fecha de pared de Lima', () => {
    const ms = Date.parse('2026-06-19T02:00:00.000Z') // 21:00 Lima del 18
    expect(todayLimaKey(ms)).toBe('2026-06-18')
  })
})
