import { describe, it, expect } from 'vitest'
import { bodySignal } from './bodySignal'

describe('bodySignal — deuda de sueño', () => {
  it('null con pocas noches', () => {
    expect(bodySignal({ recentSleepHours: [6] })).toBeNull()
    expect(bodySignal({ recentSleepHours: [] })).toBeNull()
  })
  it('null si duerme bien (sin deuda notable)', () => {
    expect(bodySignal({ recentSleepHours: [8, 7.5, 8] })).toBeNull()
  })
  it('señala deuda acumulada de varias noches cortas', () => {
    const s = bodySignal({ recentSleepHours: [6, 5.5, 6, 6] }) // avg ~5.9 → debt ~6.5h
    expect(s).toContain('deuda de sueño')
    expect(s).toContain('4 noches')
  })
  it('ignora valores inválidos', () => {
    expect(bodySignal({ recentSleepHours: [0, 99, NaN, 5, 5] })).toContain('deuda de sueño') // usa solo 5,5
  })
})
