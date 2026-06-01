// SIR V2 — Financial Engine
//
// All aggregations operate on amountPEN, never on amount, so mixed-
// currency portfolios (PEN + USD) are summed in a single base currency.
// USD movements were converted to PEN at registration time and the rate
// is captured per-row (no rolling re-conversion).
import type { FinancialMovement, SpendIntent } from '@/types'

export interface FinancialScore { stability: number; liquidityScore: number; savingsRate: number; monthlyBalance: number; riskLevel: 'low'|'medium'|'high'|'critical'; trend: 'improving'|'stable'|'declining' }
export interface FinancialAlert { type: string; severity: 'info'|'warning'|'critical'; message: string; suggestedAction: string }

export function analyzeFinancialStability(movements: FinancialMovement[], liquidityMonths = 0): FinancialScore {
  const income = movements.filter(m => m.type === 'income').reduce((s, m) => s + m.amountPEN, 0)
  const expenses = movements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amountPEN, 0)
  const balance = income - expenses
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0
  const liquidityScore = Math.min(10, liquidityMonths * 1.5)
  const balanceScore = balance > 0 ? Math.min(10, 5 + balance / 500) : Math.max(0, 5 + balance / 500)
  const stability = liquidityScore * 0.5 + balanceScore * 0.5
  return { stability: Math.round(stability * 10) / 10, liquidityScore: Math.round(liquidityScore * 10) / 10, savingsRate: Math.round(savingsRate * 10) / 10, monthlyBalance: Math.round(balance * 100) / 100, riskLevel: stability < 3 ? 'critical' : stability < 5 ? 'high' : stability < 7 ? 'medium' : 'low', trend: balance > 0 ? 'improving' : balance === 0 ? 'stable' : 'declining' }
}

export function detectFinancialAlerts(movements: FinancialMovement[], liquidityMonths: number): FinancialAlert[] {
  const alerts: FinancialAlert[] = []
  if (liquidityMonths < 2) alerts.push({ type: 'liquidity', severity: 'critical', message: `Liquidez critica: ${liquidityMonths} mes(es)`, suggestedAction: 'Reducir gastos no esenciales' })
  const income = movements.filter(m => m.type === 'income').reduce((s, m) => s + m.amountPEN, 0)
  const expenses = movements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amountPEN, 0)
  if (expenses > income * 0.9) alerts.push({ type: 'overspend', severity: 'warning', message: 'Gastos >90% del ingreso', suggestedAction: 'Revisar gastos' })
  return alerts
}

// ─── Gasto por intención (P1) ───────────────────────────────────────
// La intención (obligatorio/necesario/no_esencial) es ortogonal a la
// categoría. Solo las SALIDAS (expense/debt) se clasifican; el resto no entra.
// Operamos sobre amountPEN para mezclar monedas en una sola base.

/** Tipos de movimiento que cuentan como "salida de dinero" clasificable. */
const OUTFLOW_TYPES: ReadonlySet<FinancialMovement['type']> = new Set(['expense', 'debt'])

/** Orden canónico de presentación (de más a menos prescindible-inverso). */
export const SPEND_INTENT_ORDER: SpendIntent[] = ['obligatorio', 'necesario', 'no_esencial']

export interface IntentBreakdownItem {
  intent: SpendIntent
  totalPEN: number
  count: number
  /** % sobre el total clasificado (0 si no hay nada clasificado). */
  pct: number
}

export interface SpendingByIntent {
  /** Siempre los 3 ítems, en SPEND_INTENT_ORDER (totalPEN 0 si no hay). */
  items: IntentBreakdownItem[]
  classifiedPEN: number
  classifiedCount: number
  /** Salidas (expense/debt) SIN intención asignada — para empujar a clasificar. */
  unclassifiedPEN: number
  unclassifiedCount: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Desglose del gasto por intención. Suma amountPEN de las salidas (expense/debt)
 * agrupadas por intent. Las salidas sin intent se reportan aparte (no se
 * inventan ni se distribuyen). Determinístico, sin red.
 */
export function analyzeSpendingByIntent(movements: FinancialMovement[]): SpendingByIntent {
  const totals = new Map<SpendIntent, { sum: number; count: number }>()
  for (const intent of SPEND_INTENT_ORDER) totals.set(intent, { sum: 0, count: 0 })
  let unclassifiedPEN = 0
  let unclassifiedCount = 0

  for (const m of movements) {
    if (!OUTFLOW_TYPES.has(m.type)) continue
    const amt = Number.isFinite(m.amountPEN) ? m.amountPEN : 0
    if (m.intent && totals.has(m.intent)) {
      const acc = totals.get(m.intent)!
      acc.sum += amt
      acc.count += 1
    } else {
      unclassifiedPEN += amt
      unclassifiedCount += 1
    }
  }

  const classifiedPEN = SPEND_INTENT_ORDER.reduce((s, i) => s + totals.get(i)!.sum, 0)
  const classifiedCount = SPEND_INTENT_ORDER.reduce((s, i) => s + totals.get(i)!.count, 0)

  const items: IntentBreakdownItem[] = SPEND_INTENT_ORDER.map((intent) => {
    const acc = totals.get(intent)!
    return {
      intent,
      totalPEN: round2(acc.sum),
      count: acc.count,
      pct: classifiedPEN > 0 ? Math.round((acc.sum / classifiedPEN) * 100) : 0,
    }
  })

  return {
    items,
    classifiedPEN: round2(classifiedPEN),
    classifiedCount,
    unclassifiedPEN: round2(unclassifiedPEN),
    unclassifiedCount,
  }
}
