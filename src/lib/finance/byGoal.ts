// SIR V2 — Dinero por objetivo: cruza los movimientos de finanzas con los
// objetivos vía FinancialMovement.relatedGoal.
//
// Rescata un campo que se guardaba y nadie leía: cuánto llevás INVERTIDO (plata
// que sale: gasto/inversión/deuda) o generado como INGRESO (plata que entra)
// hacia cada objetivo. Alto valor para los objetivos de plata de Aaron (ingresos,
// clientes de Marlab). PURO: trabaja sobre montos en PEN ya normalizados.

import type { FinancialMovement } from '@/types'

export interface GoalMoney {
  goalId: string
  /** Plata que SALE hacia el objetivo (expense + investment + debt), en PEN. */
  investedPEN: number
  /** Plata que ENTRA atribuida al objetivo (income), en PEN. */
  earnedPEN: number
  /** Movimientos vinculados (de cualquier tipo salvo transfer). */
  count: number
}

const OUT_TYPES = new Set(['expense', 'investment', 'debt'])
const IN_TYPES = new Set(['income'])

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Agrupa el dinero por objetivo. Solo movimientos con relatedGoal; ignora
 *  transfers (ni entra ni sale del patrimonio). PURO. */
export function moneyByGoal(movements: FinancialMovement[]): Map<string, GoalMoney> {
  const byGoal = new Map<string, GoalMoney>()
  for (const m of movements) {
    const goalId = m.relatedGoal
    if (!goalId) continue
    if (m.type === 'transfer') continue
    const amt = Number.isFinite(m.amountPEN) ? m.amountPEN : 0
    const g = byGoal.get(goalId) ?? { goalId, investedPEN: 0, earnedPEN: 0, count: 0 }
    if (OUT_TYPES.has(m.type)) g.investedPEN = round2(g.investedPEN + amt)
    else if (IN_TYPES.has(m.type)) g.earnedPEN = round2(g.earnedPEN + amt)
    g.count += 1
    byGoal.set(goalId, g)
  }
  return byGoal
}

/** El dinero vinculado a UN objetivo, o null si no hay ninguno. PURO. */
export function moneyForGoal(movements: FinancialMovement[], goalId: string): GoalMoney | null {
  return moneyByGoal(movements).get(goalId) ?? null
}
