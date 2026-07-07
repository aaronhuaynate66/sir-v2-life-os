import { describe, it, expect } from 'vitest'

import { volumeFromWeekly } from './analyze'

const WEEK = 7 * 86_400_000
const FIRST = Date.UTC(2023, 5, 26) // lunes 26-jun-2023

describe('volumeFromWeekly', () => {
  it('serie plana → estable, sin changepoint', () => {
    const v = volumeFromWeekly(new Array(20).fill(50), FIRST)
    expect(v).not.toBeNull()
    expect(v!.direction).toBe('estable')
    expect(v!.changePoint).toBeNull()
  })

  it('detecta el quiebre "se enfrió" y su fecha aproximada', () => {
    // 12 semanas altas (~120) + 12 bajas (~20): el changepoint cae cerca de la 12.
    const weekly = [...new Array(12).fill(120), ...new Array(12).fill(20)]
    const v = volumeFromWeekly(weekly, FIRST)
    expect(v).not.toBeNull()
    expect(v!.changePoint).not.toBeNull()
    expect(v!.changePoint!.direction).toBe('se enfrió')
    expect(v!.changePoint!.beforeAvg).toBeGreaterThan(v!.changePoint!.afterAvg)
    // el quiebre cae en algún punto de la serie (fecha derivada de FIRST + idx*WEEK)
    const weeksIn = (v!.changePoint!.at - FIRST) / WEEK
    expect(weeksIn).toBeGreaterThan(6)
    expect(weeksIn).toBeLessThan(18)
  })

  it('menos de 3 semanas → null', () => {
    expect(volumeFromWeekly([10, 20], FIRST)).toBeNull()
  })
})
