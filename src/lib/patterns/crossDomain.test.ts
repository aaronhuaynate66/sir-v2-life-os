import { describe, it, expect } from 'vitest'
import { observeCrossDomain } from './crossDomain'
import type { DayPoint } from './observe'

function days(n: number, start = '2026-03-01'): string[] {
  const base = new Date(`${start}T00:00:00Z`).getTime()
  return Array.from({ length: n }, (_, i) => new Date(base + i * 86400000).toISOString().slice(0, 10))
}

describe('observeCrossDomain', () => {
  it('muestra chica → sin observaciones', () => {
    const ds = days(6)
    const sleepHours: DayPoint[] = ds.map((d) => ({ date: d, value: 7 }))
    const relTone: DayPoint[] = ds.map((d) => ({ date: d, value: 3 }))
    expect(observeCrossDomain({ sleepHours, restingHr: [], relTone, conflictDays: new Set() })).toEqual([])
  })

  it('con muestra y efecto: sueño alto → charlas más cálidas', () => {
    const ds = days(20)
    // primeras 10 noches: poco sueño (5h) → tono bajo (2); siguientes 10: buen sueño (8h) → tono alto (4)
    const sleepHours: DayPoint[] = ds.map((d, i) => ({ date: d, value: i < 10 ? 5 : 8 }))
    const relTone: DayPoint[] = ds.map((d, i) => ({ date: d, value: i < 10 ? 2 : 4 }))
    const obs = observeCrossDomain({ sleepHours, restingHr: [], relTone, conflictDays: new Set() })
    const found = obs.find((o) => o.id === 'sueno-tono')
    expect(found).toBeTruthy()
    expect(found?.strength).toBe('clara')
  })

  it('conflicto (binario) → menos sueño esos días', () => {
    const ds = days(20)
    const conflict = new Set(ds.slice(0, 6))
    const sleepHours: DayPoint[] = ds.map((d, i) => ({ date: d, value: i < 6 ? 5 : 7.5 }))
    const obs = observeCrossDomain({ sleepHours, restingHr: [], relTone: [], conflictDays: conflict })
    expect(obs.some((o) => o.id === 'conflicto-sueno')).toBe(true)
  })
})
