// SIR V2 — Tests de la deuda de sueño acumulada (11·M1).

import { describe, it, expect } from 'vitest'
import { accumulatedSleepDebt } from './debt'

const NOW = Date.parse('2026-07-14T12:00:00Z')
function ago(n: number): string {
  return new Date(NOW - n * 86_400_000).toISOString().slice(0, 10)
}

describe('accumulatedSleepDebt', () => {
  it('acumula el déficit noche a noche', () => {
    // 5 noches de 5.5h → déficit 2h c/u = 10h de deuda.
    const recs = [1, 2, 3, 4, 5].map((n) => ({ date: ago(n), duration: 5.5 }))
    const r = accumulatedSleepDebt(recs, NOW)
    expect(r.debtHours).toBe(10)
    expect(r.nightsToBase).toBe(20) // 10 / 0.5
  })

  it('una noche larga amortiza PARCIAL (no borra la deuda)', () => {
    // 2 noches de 5.5h (déficit 4h total) + 1 noche de 9.5h (excedente 2h → paga 1h).
    const recs = [
      { date: ago(3), duration: 5.5 },
      { date: ago(2), duration: 5.5 },
      { date: ago(1), duration: 9.5 },
    ]
    const r = accumulatedSleepDebt(recs, NOW)
    // 4h deuda − (2h excedente × 0.5) = 3h.
    expect(r.debtHours).toBe(3)
  })

  it('durmiendo en el target la deuda no crece ni baja', () => {
    const recs = [1, 2, 3, 4, 5, 6].map((n) => ({ date: ago(n), duration: 7.5 }))
    expect(accumulatedSleepDebt(recs, NOW).debtHours).toBe(0)
  })

  it('la deuda no baja de 0 aunque sobren muchas horas', () => {
    const recs = [1, 2, 3].map((n) => ({ date: ago(n), duration: 10 }))
    expect(accumulatedSleepDebt(recs, NOW).debtHours).toBe(0)
  })

  it('marca cobertura insuficiente (<5 de los últimos 7 días)', () => {
    const recs = [{ date: ago(1), duration: 5 }, { date: ago(2), duration: 5 }]
    const r = accumulatedSleepDebt(recs, NOW)
    expect(r.recentCoverage).toBe(2)
    expect(r.sufficient).toBe(false)
  })

  it('cobertura suficiente con 5+ noches recientes', () => {
    const recs = [1, 2, 3, 4, 5].map((n) => ({ date: ago(n), duration: 6 }))
    expect(accumulatedSleepDebt(recs, NOW).sufficient).toBe(true)
  })

  it('ignora noches fuera de la ventana de 14 días', () => {
    const recs = [{ date: ago(30), duration: 3 }, { date: ago(1), duration: 7.5 }]
    expect(accumulatedSleepDebt(recs, NOW).debtHours).toBe(0)
  })

  it('sin registros → sin deuda, insuficiente', () => {
    const r = accumulatedSleepDebt([], NOW)
    expect(r.debtHours).toBe(0)
    expect(r.sufficient).toBe(false)
  })
})
