import { describe, it, expect } from 'vitest'
import { daysUntil, countdownLabel, blockersProgress, type ObjectiveBlocker } from './plan'

const NOW = new Date('2026-06-26T12:00:00')
describe('daysUntil', () => {
  it('futuro/hoy/pasado/inválido', () => {
    expect(daysUntil('2026-06-28', NOW)).toBe(2)
    expect(daysUntil('2026-06-26', NOW)).toBe(0)
    expect(daysUntil('2026-06-20', NOW)).toBe(-6)
    expect(daysUntil(null, NOW)).toBeNull()
    expect(daysUntil('nope', NOW)).toBeNull()
  })
})
describe('countdownLabel', () => {
  it('frases', () => {
    expect(countdownLabel('2026-11-06', NOW)).toContain('faltan')
    expect(countdownLabel('2026-06-27', NOW)).toBe('falta 1 día')
    expect(countdownLabel('2026-06-26', NOW)).toBe('es hoy')
  })
})
describe('blockersProgress', () => {
  const b = (done: boolean): ObjectiveBlocker => ({ id: Math.random().toString(), goalId: 'g', title: 'x', dueOn: null, done, sort: 0 })
  it('porcentaje', () => {
    expect(blockersProgress([])).toBeNull()
    expect(blockersProgress([b(true), b(false), b(false), b(false)])).toBe(25)
    expect(blockersProgress([b(true), b(true)])).toBe(100)
  })
})
