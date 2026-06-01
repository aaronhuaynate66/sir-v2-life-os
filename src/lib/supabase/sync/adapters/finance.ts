// SIR V2 — Finance table adapter (Sesión 20c, currency in Sesión Currency)

import type { FinancialMovement, MovementType, FinancialCategory, Currency, SpendIntent } from '@/types'
import type { TableAdapter } from '../types'

function normalizeCurrency(value: unknown): Currency {
  return value === 'USD' ? 'USD' : 'PEN'
}

const INTENTS: SpendIntent[] = ['obligatorio', 'necesario', 'no_esencial']
function normalizeIntent(value: unknown): SpendIntent | undefined {
  return INTENTS.includes(value as SpendIntent) ? (value as SpendIntent) : undefined
}

export const financeMovementAdapter: TableAdapter<FinancialMovement> = {
  table: 'finance_movements',
  toRow: (m, userId) => ({
    id: m.id,
    user_id: userId,
    type: m.type,
    amount: m.amount,
    currency: m.currency,
    exchange_rate: m.exchangeRate,
    amount_pen: m.amountPEN,
    category: m.category,
    intent: m.intent ?? null,
    description: m.description,
    date: m.date,
    recurrent: m.recurrent,
    recurrent_period: m.recurrentPeriod ?? null,
    related_goal: m.relatedGoal ?? null,
    tags: m.tags ?? [],
  }),
  fromRow: (row) => {
    const currency = normalizeCurrency(row.currency)
    const amount = Number(row.amount)
    const exchangeRate = Number(row.exchange_rate) || 1.0
    // Backstop for legacy rows pre-currency migration where amount_pen is
    // missing client-side (DB always has it post-0003).
    const amountPenRaw = row.amount_pen
    const amountPEN =
      typeof amountPenRaw === 'number' || (typeof amountPenRaw === 'string' && amountPenRaw)
        ? Number(amountPenRaw)
        : currency === 'PEN'
          ? amount
          : amount * exchangeRate
    return {
      id: row.id as string,
      type: row.type as MovementType,
      amount,
      currency,
      exchangeRate,
      amountPEN,
      category: row.category as FinancialCategory,
      intent: normalizeIntent(row.intent),
      description: row.description as string,
      date: row.date as string,
      recurrent: Boolean(row.recurrent),
      recurrentPeriod: (row.recurrent_period as string) ?? undefined,
      relatedGoal: (row.related_goal as string) ?? undefined,
      tags: (row.tags as string[]) ?? [],
    }
  },
}
