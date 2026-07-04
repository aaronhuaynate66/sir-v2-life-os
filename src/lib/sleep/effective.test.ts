// SIR V2 — Tests de horas efectivas + deuda ajustada por calidad (SF·F3).

import { describe, it, expect } from 'vitest'
import { effectiveSleepHours, qualityAdjustedDebt } from './effective'
import type { SleepRecord } from '@/types'

function rec(partial: Partial<SleepRecord>): SleepRecord {
  return { id: 'x', date: '2026-07-01', bedtime: '23:00', wakeTime: '07:00', duration: 8, quality: 7, ...partial }
}

describe('effectiveSleepHours', () => {
  it('sin señal de calidad no descuenta (factor 1, adjusted false)', () => {
    const e = effectiveSleepHours(rec({ duration: 8, bedtime: '00:00', wakeTime: '00:00' }))
    expect(e.factor).toBe(1)
    expect(e.effectiveHours).toBe(8)
    expect(e.adjusted).toBe(false)
  })

  it('una noche fragmentada + poco reparadora vale MENOS horas efectivas', () => {
    // 8h con 6 despertares (frag 0.75/h... subimos) y poco profundo/REM.
    const e = effectiveSleepHours(rec({ duration: 8, awakenings: 8, deepMin: 20, lightMin: 400, remMin: 40 }))
    expect(e.factor).toBeLessThan(1)
    expect(e.effectiveHours).toBeLessThan(8)
    expect(e.adjusted).toBe(true)
    expect(e.reasons.length).toBeGreaterThan(0)
  })

  it('una noche limpia y reparadora casi no descuenta', () => {
    const e = effectiveSleepHours(rec({ duration: 8, awakenings: 0, deepMin: 110, lightMin: 250, remMin: 120 }))
    expect(e.factor).toBeGreaterThanOrEqual(0.99)
    expect(e.effectiveHours).toBeCloseTo(8, 1)
  })

  it('nunca descuenta más del 30% (piso 0.7)', () => {
    const e = effectiveSleepHours(rec({ duration: 8, awakenings: 50, deepMin: 1, lightMin: 470, remMin: 1 }))
    expect(e.factor).toBeGreaterThanOrEqual(0.7)
  })
})

describe('qualityAdjustedDebt', () => {
  const NOW = Date.parse('2026-07-08T12:00:00Z')
  function ago(n: number): string {
    return new Date(NOW - n * 86_400_000).toISOString().slice(0, 10)
  }

  it('noches fragmentadas de 7.5h generan MÁS deuda que las mismas horas limpias', () => {
    const clean = [1, 2, 3, 4, 5].map((n) => rec({ date: ago(n), duration: 7.5, awakenings: 0, deepMin: 100, lightMin: 230, remMin: 110 }))
    const noisy = [1, 2, 3, 4, 5].map((n) => rec({ date: ago(n), duration: 7.5, awakenings: 10, deepMin: 15, lightMin: 420, remMin: 15 }))
    const cleanDebt = qualityAdjustedDebt(clean, NOW).debtHours
    const noisyDebt = qualityAdjustedDebt(noisy, NOW).debtHours
    expect(noisyDebt).toBeGreaterThan(cleanDebt)
  })

  it('sin señal de calidad, la deuda ajustada = la deuda por horas brutas', () => {
    const recs = [1, 2, 3].map((n) => rec({ date: ago(n), duration: 6, bedtime: '00:00', wakeTime: '00:00' }))
    // 3 noches de 6h = déficit 1.5 c/u = 4.5h de deuda (sin descuento de calidad).
    expect(qualityAdjustedDebt(recs, NOW).debtHours).toBe(4.5)
  })
})
