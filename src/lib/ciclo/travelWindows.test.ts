// SIR V2 — Tests del ranking de ventanas de viaje.

import { describe, it, expect } from 'vitest'
import { rankTravelWindows, windowLabel } from './travelWindows'

// Ciclo 28d desde 2026-05-26 → ovulación ~día 14 (folicular/ovulación = energía alta),
// SPM ~días 24-28 (menos resto).
const BASE = { lastPeriodStart: '2026-05-26', cycleLengthDays: 28, bandDays: 4, now: new Date(2026, 6, 8) }

describe('rankTravelWindows', () => {
  it('rankea primero los tramos de más energía (folicular/ovulación) y últimos los de SPM', () => {
    const ws = rankTravelWindows({ ...BASE, fromIso: '2026-07-08', toIso: '2026-08-15', tripDays: 3, limit: 40 })
    expect(ws.length).toBeGreaterThan(5)
    // El mejor tiene más energía que el peor y menos días de bajón.
    const best = ws[0], worst = ws[ws.length - 1]
    expect(best.avgEnergy).toBeGreaterThan(worst.avgEnergy)
    expect(best.score).toBeGreaterThanOrEqual(worst.score)
  })
  it('el mejor tramo NO cae mayormente en SPM/menstruación', () => {
    const ws = rankTravelWindows({ ...BASE, fromIso: '2026-07-08', toIso: '2026-09-15', tripDays: 3, limit: 5 })
    expect(ws[0].lowDays).toBeLessThan(ws[0].days)
  })
  it('onlyWeekends → todas arrancan viernes', () => {
    const ws = rankTravelWindows({ ...BASE, fromIso: '2026-12-01', toIso: '2026-12-31', tripDays: 3, onlyWeekends: true })
    for (const w of ws) expect(w.isWeekend).toBe(true)
  })
  it('la incertidumbre crece con la distancia', () => {
    const near = rankTravelWindows({ ...BASE, fromIso: '2026-07-10', toIso: '2026-07-20', tripDays: 2, limit: 1 })[0]
    const far = rankTravelWindows({ ...BASE, fromIso: '2026-11-10', toIso: '2026-11-20', tripDays: 2, limit: 1 })[0]
    expect(far.uncertaintyDays).toBeGreaterThan(near.uncertaintyDays)
  })
  it('rango inválido o sin datos → []', () => {
    expect(rankTravelWindows({ ...BASE, fromIso: '2026-08-01', toIso: '2026-07-01', tripDays: 3 })).toEqual([])
    expect(rankTravelWindows({ ...BASE, lastPeriodStart: 'nope', fromIso: '2026-07-08', toIso: '2026-08-01', tripDays: 3 })).toEqual([])
  })
})

describe('windowLabel', () => {
  it('describe fase + energía', () => {
    const [w] = rankTravelWindows({ ...BASE, fromIso: '2026-07-08', toIso: '2026-08-15', tripDays: 3, limit: 1 })
    const label = windowLabel(w)
    expect(label).toMatch(/energía (alta|media|baja)/)
  })
})
