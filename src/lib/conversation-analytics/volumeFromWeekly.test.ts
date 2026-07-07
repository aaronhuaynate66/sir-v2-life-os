import { describe, it, expect } from 'vitest'

import { volumeFromWeekly, weeklyVolumeSeries } from './analyze'

const WEEK = 7 * 86_400_000
const FIRST = Date.UTC(2023, 5, 26) // lunes 26-jun-2023

describe('weeklyVolumeSeries', () => {
  it('agrega por semana desde el primero', () => {
    // 3 mensajes en la semana 0, 2 en la semana 2, 20 repartidos después.
    const stamps: string[] = []
    for (let i = 0; i < 3; i++) stamps.push(new Date(FIRST + i * 3600_000).toISOString())
    for (let i = 0; i < 2; i++) stamps.push(new Date(FIRST + 2 * WEEK + i * 3600_000).toISOString())
    for (let w = 3; w < 8; w++) for (let i = 0; i < 4; i++) stamps.push(new Date(FIRST + w * WEEK + i * 3600_000).toISOString())
    const s = weeklyVolumeSeries(stamps)
    expect(s).not.toBeNull()
    expect(s!.firstMs).toBe(FIRST)
    expect(s!.weekly[0]).toBe(3)
    expect(s!.weekly[1]).toBe(0)
    expect(s!.weekly[2]).toBe(2)
    expect(s!.weeks).toBe(s!.weekly.length)
  })
  it('histórico corto (<4 semanas o <12 msgs) → null', () => {
    expect(weeklyVolumeSeries([new Date(FIRST).toISOString(), new Date(FIRST + WEEK).toISOString()])).toBeNull()
    // 12 msgs pero todos en 1 semana → weeks<4 → null
    const oneWeek = Array.from({ length: 15 }, (_, i) => new Date(FIRST + i * 3600_000).toISOString())
    expect(weeklyVolumeSeries(oneWeek)).toBeNull()
  })
  it('ignora timestamps inválidos/nulos', () => {
    const stamps = [null, 'no-fecha', ...Array.from({ length: 12 }, (_, i) => new Date(FIRST + i * WEEK).toISOString())]
    const s = weeklyVolumeSeries(stamps)
    expect(s).not.toBeNull()
    expect(s!.weeks).toBeGreaterThanOrEqual(11)
  })
})

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
