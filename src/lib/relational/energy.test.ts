// SIR V2 — Tests de vínculos que drenan vs energizan (15·4).

import { describe, it, expect } from 'vitest'
import { readRelationalEnergy, type SelfMetricPoint } from './energy'

const NOW = new Date('2026-07-01T12:00:00Z')
function daysAgo(d: number): string {
  return new Date(NOW.getTime() - d * 86_400_000).toISOString()
}

describe('readRelationalEnergy', () => {
  it('neutral → sin guía', () => {
    const r = readRelationalEnergy({ energyImpact: 'neutral', interactionDates: [], selfMetrics: [] }, NOW)
    expect(r.guidance).toBeNull()
  })

  it('draining sin datos → guía por el dato declarado, sin corroborar', () => {
    const r = readRelationalEnergy({ energyImpact: 'draining', personName: 'Tío Difícil', interactionDates: [], selfMetrics: [] }, NOW)
    expect(r.corroborated).toBe(false)
    expect(r.stressDelta).toBeNull()
    expect(r.guidance).toMatch(/drena|límite|espaciar/i)
    expect(r.guidance).not.toMatch(/respaldan/i)
  })

  it('draining CORROBORADO: estrés sube tras las interacciones', () => {
    // baseline de estrés bajo; picos altos en los días posteriores a las visitas.
    const metrics: SelfMetricPoint[] = [
      { category: 'stress', value: 3, timestamp: daysAgo(40) },
      { category: 'stress', value: 3, timestamp: daysAgo(38) },
      { category: 'stress', value: 3, timestamp: daysAgo(36) },
      // días siguientes a las 3 visitas → estrés alto
      { category: 'stress', value: 8, timestamp: daysAgo(19) },
      { category: 'stress', value: 8, timestamp: daysAgo(14) },
      { category: 'stress', value: 8, timestamp: daysAgo(9) },
    ]
    const r = readRelationalEnergy({
      energyImpact: 'draining', personName: 'Tío',
      interactionDates: [daysAgo(20), daysAgo(15), daysAgo(10)],
      selfMetrics: metrics,
    }, NOW)
    expect(r.stressDelta).not.toBeNull()
    expect(r.stressDelta! > 0).toBe(true)
    expect(r.corroborated).toBe(true)
    expect(r.guidance).toMatch(/respaldan/i)
  })

  it('energizing → guía de apoyarte en el vínculo', () => {
    const r = readRelationalEnergy({ energyImpact: 'energizing', personName: 'Mica', interactionDates: [], selfMetrics: [] }, NOW)
    expect(r.guidance).toMatch(/energiza|apoyarte/i)
    expect(r.corroborated).toBe(false)
  })

  it('no corrobora con menos de 3 muestras en la ventana', () => {
    const metrics: SelfMetricPoint[] = [
      { category: 'stress', value: 3, timestamp: daysAgo(40) },
      { category: 'stress', value: 3, timestamp: daysAgo(38) },
      { category: 'stress', value: 9, timestamp: daysAgo(19) }, // solo 1 en ventana
    ]
    const r = readRelationalEnergy({
      energyImpact: 'draining', interactionDates: [daysAgo(20)], selfMetrics: metrics,
    }, NOW)
    expect(r.corroborated).toBe(false)
  })
})
