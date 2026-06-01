import { describe, it, expect } from 'vitest'
import type { SelfMetric, FinancialMovement, SpendIntent } from '@/types'
import { correlateStressVsNonEssentialSpend } from './emotionFinance'

let n = 0
function stress(date: string, value: number): SelfMetric {
  return { id: `s_${n++}`, category: 'stress', value, timestamp: `${date}T12:00:00.000Z` }
}
function metric(date: string, category: SelfMetric['category'], value: number): SelfMetric {
  return { id: `m_${n++}`, category, value, timestamp: `${date}T12:00:00.000Z` }
}
function spend(date: string, amountPEN: number, intent: SpendIntent = 'no_esencial', type: FinancialMovement['type'] = 'expense'): FinancialMovement {
  return {
    id: `f_${n++}`, type, amount: amountPEN, currency: 'PEN', exchangeRate: 1, amountPEN,
    category: 'other', intent, description: '', date, recurrent: false, tags: [],
  }
}

describe('correlateStressVsNonEssentialSpend', () => {
  it('pocos días → insufficient_data, sin patrón', () => {
    const r = correlateStressVsNonEssentialSpend([stress('2026-01-01', 8)], [])
    expect(r.status).toBe('insufficient_data')
    expect(r.hasPattern).toBe(false)
    expect(r.insight).toBeNull()
  })

  it('detecta el patrón estrés↑ → gasto no-esencial↑', () => {
    const metrics: SelfMetric[] = [
      // 3 días estrés bajo
      stress('2026-01-01', 2), stress('2026-01-02', 3), stress('2026-01-03', 2),
      // 3 días estrés alto
      stress('2026-01-10', 8), stress('2026-01-11', 9), stress('2026-01-12', 8),
    ]
    const movements: FinancialMovement[] = [
      // bajo: poco gasto no-esencial
      spend('2026-01-01', 10), spend('2026-01-02', 0 + 0.0001 - 0.0001), // ~0
      // alto: mucho delivery/antojo
      spend('2026-01-10', 80), spend('2026-01-11', 120), spend('2026-01-12', 100),
    ]
    const r = correlateStressVsNonEssentialSpend(metrics, movements)
    expect(r.status).toBe('ok')
    expect(r.hasPattern).toBe(true)
    expect(r.delta).not.toBeNull()
    expect(r.delta!.highAvg).toBeGreaterThan(r.delta!.lowAvg)
    expect(r.insight).toContain('estrés alto')
    const high = r.buckets.find((b) => b.level === 'high')!
    expect(high.dayCount).toBe(3)
    expect(high.avgNonEssentialPEN).toBe(100) // (80+120+100)/3
  })

  it('sin diferencia de gasto → ok pero sin patrón (no inventa)', () => {
    const metrics: SelfMetric[] = [
      stress('2026-01-01', 2), stress('2026-01-02', 2), stress('2026-01-03', 3),
      stress('2026-01-10', 8), stress('2026-01-11', 9), stress('2026-01-12', 8),
    ]
    const movements: FinancialMovement[] = [
      spend('2026-01-01', 50), spend('2026-01-02', 50), spend('2026-01-03', 50),
      spend('2026-01-10', 50), spend('2026-01-11', 50), spend('2026-01-12', 50),
    ]
    const r = correlateStressVsNonEssentialSpend(metrics, movements)
    expect(r.status).toBe('ok')
    expect(r.hasPattern).toBe(false)
    expect(r.insight).toBeNull()
  })

  it('ignora métricas que no son estrés y gastos que no son no-esencial', () => {
    const metrics: SelfMetric[] = [
      stress('2026-01-10', 8), stress('2026-01-11', 9), stress('2026-01-12', 8),
      stress('2026-01-01', 2), stress('2026-01-02', 2), stress('2026-01-03', 2),
      // ruido: mood/energy no deben contar como estrés
      metric('2026-01-10', 'mood', 1), metric('2026-01-01', 'energy', 9),
    ]
    const movements: FinancialMovement[] = [
      // en estrés alto: gasto OBLIGATORIO (no debe contar) + no-esencial
      spend('2026-01-10', 500, 'obligatorio'), spend('2026-01-10', 90, 'no_esencial'),
      spend('2026-01-11', 90, 'no_esencial'), spend('2026-01-12', 90, 'no_esencial'),
      // income con intent no_esencial (no es salida) — se ignora
      spend('2026-01-11', 999, 'no_esencial', 'income'),
    ]
    const r = correlateStressVsNonEssentialSpend(metrics, movements)
    const high = r.buckets.find((b) => b.level === 'high')!
    expect(high.avgNonEssentialPEN).toBe(90) // solo el no-esencial de salida
    const low = r.buckets.find((b) => b.level === 'low')!
    expect(low.avgNonEssentialPEN).toBe(0) // sin gasto no-esencial en días de estrés bajo
  })

  it('caso estrés-bajo ≈ 0: basta gasto alto notable para marcar patrón', () => {
    const metrics: SelfMetric[] = [
      stress('2026-01-01', 2), stress('2026-01-02', 2), stress('2026-01-03', 2),
      stress('2026-01-10', 8), stress('2026-01-11', 8), stress('2026-01-12', 8),
    ]
    const movements: FinancialMovement[] = [
      spend('2026-01-10', 30), spend('2026-01-11', 30), spend('2026-01-12', 30),
    ]
    const r = correlateStressVsNonEssentialSpend(metrics, movements)
    expect(r.hasPattern).toBe(true) // lowAvg 0, highAvg 30 ≥ 10
  })

  it('agrupa varias lecturas de estrés del mismo día (promedio)', () => {
    const metrics: SelfMetric[] = [
      stress('2026-01-01', 2), stress('2026-01-01', 4), // promedio 3 → bajo
      stress('2026-01-02', 3), stress('2026-01-03', 2),
      stress('2026-01-10', 8), stress('2026-01-11', 9), stress('2026-01-12', 8),
    ]
    const r = correlateStressVsNonEssentialSpend(metrics, [])
    const low = r.buckets.find((b) => b.level === 'low')!
    expect(low.dayCount).toBe(3) // 01, 02, 03 (no 6 lecturas)
  })
})
