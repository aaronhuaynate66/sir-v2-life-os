// SIR V2 — Tests de reforzar por competencia (12·M7).

import { describe, it, expect } from 'vitest'
import { habitReinforcement } from './reinforce'

const NOW = Date.parse('2026-07-08T12:00:00Z')
function ago(n: number): string {
  return new Date(NOW - n * 86_400_000).toISOString().slice(0, 10)
}

describe('habitReinforcement', () => {
  it('sin marcas → sin mensaje', () => {
    const r = habitReinforcement([], 0, 0, NOW)
    expect(r.message).toBeNull()
    expect(r.cumulative).toBe(0)
  })

  it('cuenta la semana y el acumulado', () => {
    const dates = [ago(1), ago(2), ago(3), ago(10), ago(40)]
    const r = habitReinforcement(dates, 3, 5, NOW)
    expect(r.weekDone).toBe(3)
    expect(r.cumulative).toBe(5)
    expect(r.message).toMatch(/3\/7 esta semana · 5 en total/)
  })

  it('racha activa → refuerzo de racha', () => {
    const r = habitReinforcement([ago(0), ago(1), ago(2), ago(3)], 4, 4, NOW)
    expect(r.message).toMatch(/racha de 4 días/i)
  })

  it('lenguaje SIEMPRE en positivo, nunca de culpa', () => {
    const r = habitReinforcement([ago(20), ago(21)], 0, 2, NOW) // esta semana 0
    expect(r.message).toMatch(/cada día que marcás suma|cada marca vuelve a sumar/i)
    expect(r.message).not.toMatch(/fallaste|fallo|rompiste/i)
  })

  it('dedupe por día', () => {
    // dos marcas el mismo día cuentan 1
    const r = habitReinforcement([ago(1), ago(1), ago(2)], 2, 2, NOW)
    expect(r.cumulative).toBe(2)
  })
})
