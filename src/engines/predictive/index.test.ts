// SIR V2 — Tests del motor predictivo (A5).

import { describe, it, expect } from 'vitest'
import { projectSeries } from './index'
import type { DayPoint } from '@/lib/patterns/observe'

function series(vals: number[], startDay = 1): DayPoint[] {
  return vals.map((value, i) => ({ date: `2026-07-${String(startDay + i).padStart(2, '0')}`, value }))
}

describe('projectSeries', () => {
  it('tendencia creciente → rising con proyección hacia arriba', () => {
    const p = projectSeries(series([4, 5, 6, 7, 8]), { horizonDays: 3 })
    expect(p.direction).toBe('rising')
    expect(p.slopePerDay).toBeCloseTo(1, 1)
    expect(p.projected).toBeGreaterThan(8)
  })

  it('tendencia decreciente → falling', () => {
    const p = projectSeries(series([8, 7, 6, 5, 4]))
    expect(p.direction).toBe('falling')
    expect(p.projected).toBeLessThan(4)
  })

  it('serie plana → flat (dentro del deadband)', () => {
    const p = projectSeries(series([6, 6.1, 5.9, 6, 6.05]))
    expect(p.direction).toBe('flat')
  })

  it('pocos puntos → insufficient (no inventa)', () => {
    const p = projectSeries(series([5, 6]))
    expect(p.direction).toBe('insufficient')
    expect(p.projected).toBeNull()
    expect(p.confidence).toBeNull()
  })

  it('todos el mismo día → insufficient', () => {
    const p: DayPoint[] = [
      { date: '2026-07-01', value: 5 }, { date: '2026-07-01', value: 6 },
      { date: '2026-07-01', value: 7 }, { date: '2026-07-01', value: 8 },
    ]
    expect(projectSeries(p).direction).toBe('insufficient')
  })

  it('ignora valores no finitos y ordena por fecha', () => {
    const p = projectSeries([
      { date: '2026-07-05', value: 8 },
      { date: '2026-07-01', value: 4 },
      { date: '2026-07-03', value: 6 },
      { date: '2026-07-02', value: 5 },
      { date: '2026-07-04', value: NaN },
    ])
    expect(p.direction).toBe('rising')
    expect(p.n).toBe(4)
  })

  it('más días + buen ajuste → confianza alta', () => {
    const p = projectSeries(series(Array.from({ length: 16 }, (_, i) => 3 + i * 0.3)))
    expect(p.confidence).toBe('high')
  })
})
