import { describe, it, expect } from 'vitest'
import { calibrateRanges, percentile, type VitalsHistory } from './calibrate'
import { DEFAULT_RANGES } from './vitalsAnomaly'

const empty: VitalsHistory = { hrvAvg: [], sleepingHr: [], respRate: [], highHrAlerts: [] }

describe('percentile', () => {
  it('null sin datos', () => expect(percentile([], 50)).toBeNull())
  it('un solo valor', () => expect(percentile([42], 90)).toBe(42))
  it('mediana', () => expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3))
  it('interpola', () => expect(percentile([10, 20], 50)).toBe(15))
  it('p90 y p10', () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(percentile(xs, 90)).toBeCloseTo(91, 0)
    expect(percentile(xs, 10)).toBeCloseTo(19, 0)
  })
})

describe('calibrateRanges', () => {
  it('sin data → usa defaults, nada calibrado', () => {
    const r = calibrateRanges(empty)
    expect(r.ranges).toEqual(DEFAULT_RANGES)
    expect(Object.values(r.calibrated).every((v) => v === false)).toBe(true)
  })

  it('poca data (< minSamples) → default por métrica', () => {
    const hist: VitalsHistory = { ...empty, hrvAvg: [70, 72, 68] } // 3 < 10
    const r = calibrateRanges(hist)
    expect(r.calibrated.hrvAvgMin).toBe(false)
    expect(r.ranges.hrvAvgMin).toBe(DEFAULT_RANGES.hrvAvgMin)
  })

  it('con suficiente data → calibra VFC (umbral bajo = p10 personal)', () => {
    // VFC que corre alto (60-95): el umbral bajo personal debería subir sobre 54.
    const hrvAvg = [95, 90, 88, 85, 82, 80, 78, 75, 70, 62, 60]
    const r = calibrateRanges({ ...empty, hrvAvg })
    expect(r.calibrated.hrvAvgMin).toBe(true)
    expect(r.ranges.hrvAvgMin).toBeGreaterThan(DEFAULT_RANGES.hrvAvgMin) // más estricto para él
  })

  it('calibra FC en sueño (umbral alto = p90 personal)', () => {
    const sleepingHr = [48, 49, 50, 50, 51, 52, 52, 53, 54, 60, 62]
    const r = calibrateRanges({ ...empty, sleepingHr })
    expect(r.calibrated.sleepingHrMax).toBe(true)
    expect(r.ranges.sleepingHrMax).toBeGreaterThan(54)
  })

  it('highHrAlerts nunca baja del default (piso ante distribución cargada en 0)', () => {
    const highHrAlerts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] // p90 ≈ 0
    const r = calibrateRanges({ ...empty, highHrAlerts })
    expect(r.ranges.highHrAlertsMax).toBe(DEFAULT_RANGES.highHrAlertsMax) // no baja de 3
  })

  it('respeta minSamples custom', () => {
    const hist: VitalsHistory = { ...empty, respRate: [14, 15, 16, 20] } // 4 muestras
    expect(calibrateRanges(hist, DEFAULT_RANGES, { minSamples: 3 }).calibrated.respRateMax).toBe(true)
    expect(calibrateRanges(hist, DEFAULT_RANGES, { minSamples: 5 }).calibrated.respRateMax).toBe(false)
  })
})
