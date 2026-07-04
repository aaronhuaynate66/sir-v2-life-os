// SIR V2 — Tests de la ventana óptima de foco (11·M5).

import { describe, it, expect } from 'vitest'
import { computeFocusWindow } from './focusWindow'
import type { EnergyCurve } from './energyCurve'
import type { Chronotype } from './chronotype'

const chrono = (p: Chronotype['position'], sufficient = true): Chronotype => ({
  midSleepMinutes: 180, midSleepLabel: '03:00', position: p, nights: 20, unstable: false, sufficient,
})
const curve = (buckets: [number, number][], sufficient = true): EnergyCurve => ({
  buckets: buckets.map(([hour, avg]) => ({ hour, avg, samples: 3 })),
  peakHour: buckets.length ? buckets.reduce((a, b) => (b[1] > a[1] ? b : a))[0] : null,
  troughHour: buckets.length ? buckets.reduce((a, b) => (b[1] < a[1] ? b : a))[0] : null,
  sufficient,
})

describe('computeFocusWindow', () => {
  it('no emite si la curva es insufficient', () => {
    const r = computeFocusWindow(curve([[9, 8]], false), chrono('intermedio'))
    expect(r.sufficient).toBe(false)
    expect(r.message).toBeNull()
  })

  it('no emite si el cronotipo es insufficient', () => {
    const r = computeFocusWindow(curve([[9, 8], [11, 7], [15, 3], [18, 5]]), chrono('intermedio', false))
    expect(r.sufficient).toBe(false)
  })

  it('sugiere las horas altas para foco y las bajas para lo mecánico', () => {
    const r = computeFocusWindow(curve([[9, 8], [10, 8], [15, 3], [18, 4]]), chrono('intermedio'))
    expect(r.sufficient).toBe(true)
    expect(r.focusHours).toContain(9)
    expect(r.focusHours).toContain(10)
    expect(r.restHours).toContain(15)
    expect(r.message).toMatch(/trabajo profundo|mecánico/i)
  })

  it('agrega la nota de cronotipo búho', () => {
    const r = computeFocusWindow(curve([[14, 8], [16, 7], [9, 3], [20, 6]]), chrono('búho'))
    expect(r.message).toMatch(/búho|más tarde/i)
  })
})
