// SIR V2 — Tests de projectMonthEndSpend.

import { describe, it, expect } from 'vitest'
import { projectMonthEndSpend } from './monthEnd'
import type { FinancialMovement } from '@/types'

// Helper para construir un movimiento mínimo (solo lo que usa el forecast).
let _n = 0
function mov(partial: Partial<FinancialMovement> & { date: string; amountPEN: number }): FinancialMovement {
  return {
    id: `m${_n++}`,
    type: 'expense',
    amount: partial.amountPEN,
    currency: 'PEN',
    exchangeRate: 1,
    category: 'other',
    description: '',
    recurrent: false,
    tags: [],
    ...partial,
  }
}

// Julio 2026 tiene 31 días. "Hoy" = 15 jul → 15 transcurridos, 16 restantes.
const NOW = new Date(2026, 6, 15, 12, 0, 0)

describe('projectMonthEndSpend — run-rate variable + fijo', () => {
  it('proyecta: fijo booked + variable a ritmo diario × días restantes', () => {
    const movements: FinancialMovement[] = [
      // Fijo: alquiler recurrente, S/1000, ya booked el 4.
      mov({ date: '2026-07-04', amountPEN: 1000, recurrent: true, category: 'housing' }),
      // Variable: 3 gastos que suman 300 en 15 días → 20/día.
      mov({ date: '2026-07-05', amountPEN: 100 }),
      mov({ date: '2026-07-10', amountPEN: 100 }),
      mov({ date: '2026-07-15', amountPEN: 100 }),
    ]
    const f = projectMonthEndSpend(movements, NOW)
    expect(f.status).toBe('ok')
    expect(f.mtdOutflowPEN).toBe(1300)
    expect(f.mtdRecurringPEN).toBe(1000)
    expect(f.mtdVariablePEN).toBe(300)
    expect(f.dailyVariablePEN).toBe(20) // 300 / 15
    // proyectado = 1300 + 20 × 16 = 1620. El fijo NO se re-extrapola.
    expect(f.projectedOutflowPEN).toBe(1620)
    expect(f.daysRemaining).toBe(16)
  })

  it('ingreso del mes se suma pero NO se extrapola', () => {
    const movements: FinancialMovement[] = [
      mov({ date: '2026-07-01', amountPEN: 5000, type: 'income' }),
      mov({ date: '2026-07-10', amountPEN: 150 }),
    ]
    const f = projectMonthEndSpend(movements, NOW)
    expect(f.mtdIncomePEN).toBe(5000)
  })

  it('excluye transfer/investment del gasto', () => {
    const movements: FinancialMovement[] = [
      mov({ date: '2026-07-05', amountPEN: 500, type: 'transfer' }),
      mov({ date: '2026-07-06', amountPEN: 800, type: 'investment' }),
      mov({ date: '2026-07-07', amountPEN: 100 }),
    ]
    const f = projectMonthEndSpend(movements, NOW)
    expect(f.mtdOutflowPEN).toBe(100)
  })

  it('debt cuenta como salida (gasto)', () => {
    const movements: FinancialMovement[] = [
      mov({ date: '2026-07-05', amountPEN: 200, type: 'debt' }),
      mov({ date: '2026-07-08', amountPEN: 100 }),
    ]
    const f = projectMonthEndSpend(movements, NOW)
    expect(f.mtdOutflowPEN).toBe(300)
  })
})

describe('projectMonthEndSpend — baseline mes anterior', () => {
  it('compara el proyectado con el gasto total del mes pasado', () => {
    const movements: FinancialMovement[] = [
      // Junio: gasto total 1000.
      mov({ date: '2026-06-10', amountPEN: 600 }),
      mov({ date: '2026-06-20', amountPEN: 400 }),
      // Julio hasta el 15: variable 150/15 = 10/día → proyectado 150 + 10×16 = 310.
      mov({ date: '2026-07-05', amountPEN: 150 }),
    ]
    const f = projectMonthEndSpend(movements, NOW)
    expect(f.lastMonthOutflowPEN).toBe(1000)
    expect(f.projectedOutflowPEN).toBe(310)
    expect(f.vsLastMonthPct).toBe(-69) // 310/1000 - 1 = -0.69
  })

  it('sin data del mes pasado → baseline null', () => {
    const movements: FinancialMovement[] = [mov({ date: '2026-07-05', amountPEN: 150 })]
    const f = projectMonthEndSpend(movements, NOW)
    expect(f.lastMonthOutflowPEN).toBeNull()
    expect(f.vsLastMonthPct).toBeNull()
  })
})

describe('projectMonthEndSpend — estados insuficientes (honestos)', () => {
  it('pocos días transcurridos → insufficient', () => {
    const early = new Date(2026, 6, 2, 12, 0, 0) // 2 jul
    const movements: FinancialMovement[] = [mov({ date: '2026-07-01', amountPEN: 50 })]
    const f = projectMonthEndSpend(movements, early)
    expect(f.status).toBe('insufficient')
    expect(f.reason).toContain('2 días')
  })

  it('sin gastos este mes → insufficient', () => {
    const movements: FinancialMovement[] = [
      mov({ date: '2026-07-05', amountPEN: 3000, type: 'income' }), // solo ingreso
    ]
    const f = projectMonthEndSpend(movements, NOW)
    expect(f.status).toBe('insufficient')
    expect(f.reason).toContain('Sin gastos')
  })

  it('último día del mes → no es proyección, es cierre', () => {
    const last = new Date(2026, 6, 31, 23, 0, 0)
    const movements: FinancialMovement[] = [mov({ date: '2026-07-10', amountPEN: 100 })]
    const f = projectMonthEndSpend(movements, last)
    expect(f.daysRemaining).toBe(0)
    expect(f.status).toBe('insufficient')
    expect(f.reason).toContain('terminó')
  })

  it('lista vacía → insufficient, sin números inventados', () => {
    const f = projectMonthEndSpend([], NOW)
    expect(f.status).toBe('insufficient')
    expect(f.projectedOutflowPEN).toBe(0)
    expect(f.mtdOutflowPEN).toBe(0)
  })
})

describe('projectMonthEndSpend — confianza por fracción del mes', () => {
  it('low al inicio, high pasada la mitad', () => {
    const movements: FinancialMovement[] = [
      mov({ date: '2026-07-01', amountPEN: 100 }),
      mov({ date: '2026-07-02', amountPEN: 100 }),
      mov({ date: '2026-07-03', amountPEN: 100 }),
      mov({ date: '2026-07-04', amountPEN: 100 }),
    ]
    // Día 5 (frac ~0.16) → low.
    expect(projectMonthEndSpend(movements, new Date(2026, 6, 5, 12)).confidence).toBe('low')
    // Día 20 (frac ~0.65) → high.
    expect(projectMonthEndSpend(movements, new Date(2026, 6, 20, 12)).confidence).toBe('high')
  })

  it('excluye gastos futuro-fechados del MTD', () => {
    const movements: FinancialMovement[] = [
      mov({ date: '2026-07-10', amountPEN: 100 }),
      mov({ date: '2026-07-28', amountPEN: 999 }), // futuro respecto al 15
    ]
    const f = projectMonthEndSpend(movements, NOW)
    expect(f.mtdOutflowPEN).toBe(100)
  })
})
