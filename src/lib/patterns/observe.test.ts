import { describe, it, expect } from 'vitest'
import { dailyAvg, compareContinuous, compareBinary, observePatterns, type DayPoint } from './observe'

function days(vals: number[], start = '2026-06-01'): DayPoint[] {
  const [y, m, d] = start.split('-').map(Number)
  return vals.map((v, i) => { const dt = new Date(y, m - 1, d + i); return { date: `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`, value: v } })
}

describe('observe', () => {
  it('dailyAvg promedia por día', () => {
    const r = dailyAvg([{ timestamp: '2026-06-01T08:00', value: 4 }, { timestamp: '2026-06-01T20:00', value: 2 }])
    expect(r).toEqual([{ date: '2026-06-01', value: 3 }])
  })
  it('NO opina con pocos días (guarda de muestra)', () => {
    expect(compareContinuous(days([7, 8, 6]), days([4, 3, 5]))).toBeNull()
  })
  it('detecta asociación clara con muestra suficiente', () => {
    // 12 días: sueño bajo (5-6h) → ánimo 2-3; sueño alto (8-9h) → ánimo 4-5
    const sleep = days([5, 6, 5, 6, 5, 6, 8, 9, 8, 9, 8, 9])
    const mood = days([2, 3, 2, 3, 2, 3, 4, 5, 4, 5, 4, 5])
    const r = compareContinuous(sleep, mood)
    expect(r).not.toBeNull()
    expect(r!.avgHigh).toBeGreaterThan(r!.avgLow)
    const obs = observePatterns({ sleepHours: sleep, mood, energy: [], stress: [], restingHr: [], migraineDays: new Set() })
    expect(obs.find((o) => o.id === 'sueno-animo')).toBeTruthy()
  })
  it('compareBinary separa días con flag', () => {
    const energy = days([4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 2, 2])
    const flags = new Set(energy.slice(8).map((p) => p.date))
    const r = compareBinary(energy, flags)
    expect(r).not.toBeNull()
    expect(r!.avgHigh).toBeLessThan(r!.avgLow) // días flag = energía más baja
  })
})
