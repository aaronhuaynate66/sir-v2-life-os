// SIR V2 — Tests del Financial Engine (lógica pura sobre amountPEN).
//
// analyzeFinancialStability / detectFinancialAlerts operan SOLO sobre
// amountPEN (multi-moneda ya convertida), sin red ni fechas → deterministas.
// Cubrimos la aritmética sutil con regression silencioso caro: guarda de
// división-por-cero del savingsRate, clamps de balanceScore [0,10] y
// liquidityScore (×1.5, tope 10), los tiers de riskLevel, el trend, el
// redondeo, y los umbrales de alertas (incluido el no-falso-positivo con
// ingreso 0).

import { describe, it, expect } from 'vitest'

import type { FinancialMovement } from '@/types'
import { analyzeFinancialStability, detectFinancialAlerts } from './index'

/** Factory mínima: el engine sólo lee `type` y `amountPEN`. */
function mv(type: FinancialMovement['type'], amountPEN: number): FinancialMovement {
  return {
    id: `m_${type}_${amountPEN}`,
    type,
    amount: amountPEN,
    currency: 'PEN',
    exchangeRate: 1,
    amountPEN,
    category: 'other',
    description: '',
    date: '2026-01-01',
    recurrent: false,
    tags: [],
  }
}

describe('analyzeFinancialStability', () => {
  it('sin movimientos ni liquidez → balanceScore base 5, stability 2.5, critical/stable', () => {
    const r = analyzeFinancialStability([], 0)
    expect(r.monthlyBalance).toBe(0)
    expect(r.savingsRate).toBe(0)
    expect(r.liquidityScore).toBe(0)
    expect(r.stability).toBe(2.5)
    expect(r.riskLevel).toBe('critical')
    expect(r.trend).toBe('stable')
  })

  it('cartera sana (income 1000, expense 400, liquidez 6) → low / improving', () => {
    const r = analyzeFinancialStability([mv('income', 1000), mv('expense', 400)], 6)
    expect(r.monthlyBalance).toBe(600)
    expect(r.savingsRate).toBe(60)
    expect(r.liquidityScore).toBe(9) // min(10, 6*1.5)
    expect(r.stability).toBe(7.6) // 9*.5 + 6.2*.5
    expect(r.riskLevel).toBe('low')
    expect(r.trend).toBe('improving')
  })

  it('GUARDA división-por-cero: income 0 NO produce NaN/Infinity en savingsRate', () => {
    const r = analyzeFinancialStability([mv('expense', 500)], 0)
    expect(r.savingsRate).toBe(0) // guard `income > 0`, no NaN
    expect(Number.isFinite(r.savingsRate)).toBe(true)
    expect(r.monthlyBalance).toBe(-500)
    expect(r.stability).toBe(2) // balanceScore = max(0, 5 - 1) = 4 → 4*.5
    expect(r.riskLevel).toBe('critical')
    expect(r.trend).toBe('declining')
  })

  it('CLAMP balanceScore a 0: déficit enorme no produce score negativo', () => {
    const r = analyzeFinancialStability([mv('income', 100), mv('expense', 5000)], 0)
    expect(r.stability).toBe(0) // balanceScore = max(0, 5 - 9.8) = 0
    expect(r.riskLevel).toBe('critical')
    expect(r.savingsRate).toBe(-4900)
    expect(r.trend).toBe('declining')
  })

  it('CLAMP liquidityScore a 10: liquidez altísima no desborda', () => {
    const r = analyzeFinancialStability([mv('income', 1000)], 100)
    expect(r.liquidityScore).toBe(10) // min(10, 100*1.5)
    expect(r.stability).toBe(8.5) // 10*.5 + 7*.5
    expect(r.riskLevel).toBe('low')
  })

  it('redondea stability a 1 decimal y mapea tier "high" (3-5)', () => {
    const r = analyzeFinancialStability([mv('income', 333)], 1)
    // liquidityScore 1.5; balanceScore min(10, 5+333/500=5.666); stability 3.583 → 3.6
    expect(r.stability).toBe(3.6)
    expect(r.riskLevel).toBe('high')
  })

  it('ignora tipos no income/expense para income y expenses (investment/transfer/debt)', () => {
    const r = analyzeFinancialStability(
      [mv('income', 1000), mv('investment', 999), mv('transfer', 50), mv('debt', 200)],
      4,
    )
    expect(r.monthlyBalance).toBe(1000) // sólo income cuenta; expense=0
  })
})

describe('detectFinancialAlerts', () => {
  it('liquidez < 2 → alerta crítica de liquidez', () => {
    const alerts = detectFinancialAlerts([mv('income', 1000), mv('expense', 500)], 1)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('liquidity')
    expect(alerts[0].severity).toBe('critical')
  })

  it('gastos > 90% del ingreso → alerta de sobregasto (sin alerta de liquidez si ≥2)', () => {
    const alerts = detectFinancialAlerts([mv('income', 1000), mv('expense', 950)], 5)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('overspend')
    expect(alerts[0].severity).toBe('warning')
  })

  it('liquidez baja Y sobregasto → ambas alertas', () => {
    const alerts = detectFinancialAlerts([mv('income', 1000), mv('expense', 950)], 1)
    expect(alerts.map((a) => a.type).sort()).toEqual(['liquidity', 'overspend'])
  })

  it('finanzas sanas (liquidez 5, gasto 50% del ingreso) → sin alertas', () => {
    expect(detectFinancialAlerts([mv('income', 1000), mv('expense', 500)], 5)).toHaveLength(0)
  })

  it('NO falso positivo de sobregasto con ingreso 0 y gasto 0', () => {
    // 0 > 0*0.9 === 0 > 0 === false → sin overspend.
    expect(detectFinancialAlerts([], 5)).toHaveLength(0)
  })
})
