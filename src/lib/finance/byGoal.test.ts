// SIR V2 — Tests de dinero por objetivo.

import { describe, it, expect } from 'vitest'
import { moneyByGoal, moneyForGoal } from './byGoal'
import type { FinancialMovement } from '@/types'

function mv(over: Partial<FinancialMovement>): FinancialMovement {
  return {
    id: `m_${Math.round(over.amountPEN ?? 0)}_${over.type}`, type: 'expense', amount: 0, currency: 'PEN',
    exchangeRate: 1, amountPEN: 0, category: 'other', description: '', date: '2026-07-01',
    recurrent: false, tags: [], ...over,
  }
}

describe('moneyByGoal', () => {
  it('suma salidas como invertido e income como ingreso, por objetivo', () => {
    const movements = [
      mv({ type: 'expense', amountPEN: 100, relatedGoal: 'g1' }),
      mv({ type: 'investment', amountPEN: 250, relatedGoal: 'g1' }),
      mv({ type: 'income', amountPEN: 5000, relatedGoal: 'g1' }),
      mv({ type: 'expense', amountPEN: 40, relatedGoal: 'g2' }),
      mv({ type: 'expense', amountPEN: 999 }), // sin objetivo → ignorado
    ]
    const byGoal = moneyByGoal(movements)
    expect(byGoal.get('g1')).toEqual({ goalId: 'g1', investedPEN: 350, earnedPEN: 5000, count: 3 })
    expect(byGoal.get('g2')).toEqual({ goalId: 'g2', investedPEN: 40, earnedPEN: 0, count: 1 })
    expect(byGoal.has('__none__')).toBe(false)
  })

  it('deuda cuenta como salida; transfer se ignora', () => {
    const byGoal = moneyByGoal([
      mv({ type: 'debt', amountPEN: 80, relatedGoal: 'g1' }),
      mv({ type: 'transfer', amountPEN: 500, relatedGoal: 'g1' }),
    ])
    expect(byGoal.get('g1')).toEqual({ goalId: 'g1', investedPEN: 80, earnedPEN: 0, count: 1 })
  })

  it('moneyForGoal devuelve el objetivo o null', () => {
    const movements = [mv({ type: 'expense', amountPEN: 100, relatedGoal: 'g1' })]
    expect(moneyForGoal(movements, 'g1')?.investedPEN).toBe(100)
    expect(moneyForGoal(movements, 'gX')).toBeNull()
  })

  it('sin movimientos vinculados → mapa vacío', () => {
    expect(moneyByGoal([mv({ amountPEN: 10 })]).size).toBe(0)
  })
})
