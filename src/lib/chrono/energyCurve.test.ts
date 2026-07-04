// SIR V2 — Tests de la curva de energía por hora (11·M3).

import { describe, it, expect } from 'vitest'
import { computeEnergyCurve, type HourSample } from './energyCurve'

// Genera N muestras a una hora LIMA dada (UTC-5). Hora Lima h → UTC h+5.
function atHour(limaHour: number, value: number, n: number): HourSample[] {
  const utc = (limaHour + 5) % 24
  return Array.from({ length: n }, (_, i) => ({
    value,
    timestamp: `2026-06-${String(1 + i).padStart(2, '0')}T${String(utc).padStart(2, '0')}:30:00.000Z`,
  }))
}

describe('computeEnergyCurve', () => {
  it('insufficient con pocas horas cubiertas', () => {
    const r = computeEnergyCurve([...atHour(9, 7, 3), ...atHour(15, 4, 3)]) // solo 2 horas
    expect(r.sufficient).toBe(false)
  })

  it('una hora con <3 muestras NO se dibuja (no interpola)', () => {
    const r = computeEnergyCurve([...atHour(9, 7, 3), ...atHour(11, 6, 2), ...atHour(13, 5, 3), ...atHour(15, 4, 3), ...atHour(18, 3, 3)])
    expect(r.buckets.some((b) => b.hour === 11)).toBe(false) // 11h tenía solo 2
    expect(r.buckets.length).toBe(4)
  })

  it('encuentra el pico y el bajón entre las horas cubiertas', () => {
    const r = computeEnergyCurve([
      ...atHour(9, 8, 3), ...atHour(11, 6, 3), ...atHour(15, 3, 3), ...atHour(18, 5, 3),
    ])
    expect(r.sufficient).toBe(true)
    expect(r.peakHour).toBe(9)
    expect(r.troughHour).toBe(15)
  })

  it('agrupa por hora LIMA, no UTC', () => {
    // 9h Lima = 14:00 UTC. Confirmamos que cae en el bucket 9.
    const r = computeEnergyCurve([...atHour(9, 7, 3), ...atHour(12, 6, 3), ...atHour(16, 5, 3), ...atHour(20, 4, 3)])
    expect(r.buckets.map((b) => b.hour)).toEqual([9, 12, 16, 20])
  })
})
