import { describe, it, expect } from 'vitest'
import { summarizeAffection, describeAffection } from './affectionSummary'
import type { DailySignal } from './types'

function day(date: string, affection: number, positivityRatio: number, messageCount = 5): DailySignal {
  return { date, messageCount, avgLen: 20, somatic: 0, friction: 0, withdrawal: 0, sensitivity: 0, actions: 0, composite: 0, affection, positivityRatio }
}

function series(n: number, affection: number, ratio: number): DailySignal[] {
  return Array.from({ length: n }, (_, i) => day(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, affection, ratio))
}

describe('summarizeAffection', () => {
  it('null si hay pocos días activos', () => {
    expect(summarizeAffection(series(5, 0.3, 4))).toBeNull()
  })

  it('ignora días sin mensajes para el conteo activo', () => {
    const withEmpty = [...series(11, 0.3, 4), day('2026-02-01', 0, 1, 0)]
    expect(summarizeAffection(withEmpty)).toBeNull() // 11 activos < 12
  })

  it('resume nivel y banda de ratio (saludable)', () => {
    const s = summarizeAffection(series(40, 0.3, 4))
    expect(s).not.toBeNull()
    expect(s!.ratioBand).toBe('saludable')
    expect(s!.recentAffection).toBeCloseTo(0.3, 1)
  })

  it('ratio alto → muy positivo; ratio <1 → de cuidado', () => {
    expect(summarizeAffection(series(40, 0.2, 6))!.ratioBand).toBe('muy positivo')
    expect(summarizeAffection(series(40, 0.05, 0.5))!.ratioBand).toBe('de cuidado')
  })

  it('detecta tendencia bajando (prior alto, reciente bajo)', () => {
    const prior = Array.from({ length: 30 }, (_, i) => day(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, 0.5, 4))
    const recent = Array.from({ length: 30 }, (_, i) => day(`2026-03-${String((i % 28) + 1).padStart(2, '0')}`, 0.1, 4))
    expect(summarizeAffection([...prior, ...recent])!.trend).toBe('bajando')
  })

  it('detecta tendencia subiendo', () => {
    const prior = Array.from({ length: 30 }, (_, i) => day(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, 0.1, 4))
    const recent = Array.from({ length: 30 }, (_, i) => day(`2026-03-${String((i % 28) + 1).padStart(2, '0')}`, 0.5, 4))
    expect(summarizeAffection([...prior, ...recent])!.trend).toBe('subiendo')
  })

  it('estable cuando el cambio es chico', () => {
    expect(summarizeAffection(series(50, 0.3, 4))!.trend).toBe('estable')
  })

  it('sin base previa suficiente → trend null pero resume igual', () => {
    const s = summarizeAffection(series(14, 0.3, 4)) // 14 activos: recent 30 toma todo, prior vacío
    expect(s).not.toBeNull()
    expect(s!.trend).toBeNull()
  })
})

describe('describeAffection', () => {
  it('null → null', () => {
    expect(describeAffection(null)).toBeNull()
  })
  it('arma una frase de cuidado con tendencia y banda', () => {
    const line = describeAffection({ activeDays: 40, recentAffection: 0.1, trend: 'bajando', ratioBand: 'de cuidado', ratio: 0.8 })
    expect(line).toContain('viene bajando')
    expect(line).toContain('roce')
  })
  it('sin tendencia usa una frase neutral', () => {
    const line = describeAffection({ activeDays: 14, recentAffection: 0.3, trend: null, ratioBand: 'saludable', ratio: 4 })
    expect(line).toContain('afecto expresado')
  })
})
