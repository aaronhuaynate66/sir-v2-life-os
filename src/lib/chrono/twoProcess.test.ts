// SIR V2 — Tests del modelo de fase acoplado S×C (11·M6).

import { describe, it, expect } from 'vitest'
import { fitTwoProcess, predictEnergy, backtestTwoProcess } from './twoProcess'
import type { EnergyCurve } from './energyCurve'

const curve = (buckets: [number, number][], sufficient = true): EnergyCurve => ({
  buckets: buckets.map(([hour, avg]) => ({ hour, avg, samples: 3 })),
  peakHour: buckets.length ? buckets.reduce((a, b) => (b[1] > a[1] ? b : a))[0] : null,
  troughHour: buckets.length ? buckets.reduce((a, b) => (b[1] < a[1] ? b : a))[0] : null,
  sufficient,
})

describe('fitTwoProcess', () => {
  it('no ajusta con curva insufficient', () => {
    expect(fitTwoProcess(curve([[9, 8]], false))).toBeNull()
  })

  it('ajusta media, amplitud y hora del pico', () => {
    const m = fitTwoProcess(curve([[9, 8], [12, 6], [15, 4], [18, 6]]))!
    expect(m.peakHour).toBe(9)
    expect(m.amplitude).toBe(2) // (8-4)/2
    expect(m.mean).toBeCloseTo(6, 1)
  })
})

describe('predictEnergy', () => {
  it('el pico circadiano da el máximo; la deuda lo baja', () => {
    const m = { mean: 6, amplitude: 2, peakHour: 10 }
    const atPeak = predictEnergy(m, 10, 0)
    const atPeakTired = predictEnergy(m, 10, 4)
    expect(atPeak).toBeCloseTo(8, 1) // mean + amplitude
    expect(atPeakTired).toBeLessThan(atPeak) // deuda resta
  })

  it('clampa a 1-10', () => {
    const m = { mean: 5, amplitude: 8, peakHour: 12 }
    expect(predictEnergy(m, 0, 20)).toBeGreaterThanOrEqual(1)
    expect(predictEnergy(m, 12, 0)).toBeLessThanOrEqual(10)
  })
})

describe('backtestTwoProcess', () => {
  it('una curva bien sinusoidal valida (MAE bajo)', () => {
    const c = curve([[10, 8], [16, 4], [4, 4], [22, 4]]) // pico 10, valles opuestos
    const m = fitTwoProcess(c)!
    const bt = backtestTwoProcess(m, c)
    expect(bt.mae).toBeLessThan(1.2)
    expect(bt.validated).toBe(true)
  })
})
