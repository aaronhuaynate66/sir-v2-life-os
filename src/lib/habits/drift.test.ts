// SIR V2 — Tests de drift temprano (12·M6).

import { describe, it, expect } from 'vitest'
import { streakAtRisk } from './drift'

describe('streakAtRisk', () => {
  it('racha con valor no marcada hoy → en riesgo', () => {
    const r = streakAtRisk(5, false)
    expect(r.atRisk).toBe(true)
    expect(r.message).toMatch(/racha de 5 en juego/i)
  })

  it('ya marcada hoy → no está en riesgo', () => {
    expect(streakAtRisk(5, true).atRisk).toBe(false)
  })

  it('racha corta (<3) → no avisa (no vale alarmar)', () => {
    expect(streakAtRisk(2, false).atRisk).toBe(false)
  })

  it('nunca culpabiliza', () => {
    const r = streakAtRisk(4, false)
    expect(r.message).not.toMatch(/fallaste|perdiste|rompiste/i)
    expect(r.message).toMatch(/sin apuro/i)
  })
})
