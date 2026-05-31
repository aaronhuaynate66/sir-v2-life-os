// SIR V2 — Tests del Biological Engine (lógica pura sueño/recuperación).
//
// LIVE (/panel, useRichContext). Aritmética sutil: recovery score ponderado
// (0.35/0.30/0.35), sleepDebt con clamp ≥0, ventanas slice(-7)/slice(-3),
// defaults cuando faltan datos, consistencia por desviación estándar, y
// recomendaciones por tiers. Regression silencioso mis-reporta el estado.

import { describe, it, expect } from 'vitest'

import type { SleepRecord, SelfMetric } from '@/types'
import { analyzeBiologicalState, analyzeSleepTrend } from './index'

let n = 0
function sleep(duration: number, quality = 7): SleepRecord {
  return {
    id: `sl_${n++}`,
    date: '2026-01-01',
    bedtime: '23:00',
    wakeTime: '07:00',
    duration,
    quality,
    notes: '',
  } as SleepRecord
}
function metric(category: SelfMetric['category'], value: number): SelfMetric {
  return { id: `sm_${n++}`, category, value, timestamp: '2026-01-01T00:00:00.000Z' }
}

describe('analyzeBiologicalState', () => {
  it('sin datos → defaults (energy 6, stress 5, sin deuda)', () => {
    const s = analyzeBiologicalState([], [])
    expect(s.energyLevel).toBe(6)
    expect(s.stressLevel).toBe(5)
    expect(s.sleepDebt).toBe(0)
    expect(s.lastSleepQuality).toBe(6)
    expect(s.lastSleepDuration).toBe(7)
    expect(s.recoveryScore).toBe(6.7) // 6*.35 + 5*.30 + 8.75*.35
  })

  it('datos buenos → recovery alto, sin deuda', () => {
    const s = analyzeBiologicalState(
      [sleep(8), sleep(8), sleep(8)],
      [metric('energy', 8), metric('stress', 2)],
    )
    expect(s.energyLevel).toBe(8)
    expect(s.stressLevel).toBe(2)
    expect(s.sleepDebt).toBe(0) // (7.5-8)*3 < 0 → clamp 0
    expect(s.recoveryScore).toBe(8.7) // 8*.35 + 8*.30 + 10*.35
  })

  it('CLAMP sleepDebt ≥ 0 y acumulación por noches cortas', () => {
    const s = analyzeBiologicalState([sleep(6), sleep(6), sleep(6), sleep(6)], [])
    expect(s.sleepDebt).toBe(6) // (7.5-6)*4 = 6
  })

  it('ventana slice(-7): sólo las últimas 7 noches cuentan', () => {
    const records = [sleep(1), ...Array.from({ length: 7 }, () => sleep(8))]
    const s = analyzeBiologicalState(records, [])
    // promedio de las 7 últimas = 8 (la noche de 1h queda fuera).
    expect(s.sleepDebt).toBe(0)
    expect(s.lastSleepDuration).toBe(8)
  })

  it('ventana slice(-3) para energía: promedia sólo las 3 últimas lecturas', () => {
    const s = analyzeBiologicalState(
      [],
      [metric('energy', 1), metric('energy', 1), metric('energy', 9), metric('energy', 9), metric('energy', 9)],
    )
    expect(s.energyLevel).toBe(9) // últimas 3 = [9,9,9]
  })
})

describe('analyzeSleepTrend', () => {
  it('sin registros → ceros y "Sin datos"', () => {
    const t = analyzeSleepTrend([])
    expect(t).toEqual({
      averageDuration: 0,
      averageQuality: 0,
      sleepDebt: 0,
      consistency: 0,
      recommendation: 'Sin datos de sueno',
    })
  })

  it('sueño óptimo y consistente → consistency 10', () => {
    const t = analyzeSleepTrend([sleep(8, 8), sleep(8, 8), sleep(8, 8)])
    expect(t.averageDuration).toBe(8)
    expect(t.consistency).toBe(10) // varianza 0
    expect(t.recommendation).toBe('Sueno en rango optimo')
  })

  it('consistency baja por varianza (desviación estándar)', () => {
    const t = analyzeSleepTrend([sleep(6, 8), sleep(8, 8)])
    // avg 7, varianza 1, sqrt 1, consistency = 10 - 1*2 = 8
    expect(t.averageDuration).toBe(7)
    expect(t.consistency).toBe(8)
  })

  it('recomendación por tiers: crítico (<6), bajo (<7), calidad (<5), óptimo', () => {
    expect(analyzeSleepTrend([sleep(5, 8)]).recommendation).toBe('Sueno critico. Prioridad maxima.')
    expect(analyzeSleepTrend([sleep(6.5, 8)]).recommendation).toBe('Sueno bajo del optimo.')
    expect(analyzeSleepTrend([sleep(8, 3)]).recommendation).toBe('Calidad de sueno baja.')
    expect(analyzeSleepTrend([sleep(8, 8)]).recommendation).toBe('Sueno en rango optimo')
  })
})
