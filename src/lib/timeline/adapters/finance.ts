// SIR V2 — FinancialMovement → TimelineEvent adapter
//
// finance_movements.date es YYYY-MM-DD. Sintetizamos un timestamp ISO usando
// T12:00:00Z para ordenar de forma estable junto a otros tipos.

import type { FinancialMovement, MovementType } from '@/types'
import type { TimelineEvent } from '../types'
import { formatCurrency } from '@/lib/format/currency'

const TYPE_LABEL: Record<MovementType, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  investment: 'Inversión',
  transfer: 'Transferencia',
  debt: 'Deuda',
}

function formatSignedAmount(m: FinancialMovement): string {
  const sign = m.type === 'income' ? '+' : m.type === 'expense' || m.type === 'debt' ? '-' : ''
  return `${sign}${formatCurrency(m.amount, m.currency)}`
}

export function adaptFinance(m: FinancialMovement): TimelineEvent {
  const typeLabel = TYPE_LABEL[m.type]
  const tags = [typeLabel, m.category, ...m.tags.slice(0, 2)]
  return {
    id: `finance:${m.id}`,
    type: 'finance',
    occurredAt: `${m.date}T12:00:00.000Z`,
    title: `${formatSignedAmount(m)} · ${m.description}`,
    body: m.currency === 'USD'
      ? `Equivalente: ${formatCurrency(m.amountPEN, 'PEN')} (TC ${m.exchangeRate})`
      : undefined,
    tags,
    meta: {
      movementType: m.type,
      currency: m.currency,
      amount: m.amount,
      amountPEN: m.amountPEN,
      exchangeRate: m.exchangeRate,
      category: m.category,
      recurrent: m.recurrent,
    },
  }
}

export function adaptFinances(rows: FinancialMovement[]): TimelineEvent[] {
  return rows.map(adaptFinance)
}
