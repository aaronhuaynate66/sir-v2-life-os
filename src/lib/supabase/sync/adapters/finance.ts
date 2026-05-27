// SIR V2 — Finance table adapter (Sesión 20c)

import type { FinancialMovement, MovementType, FinancialCategory } from '@/types'
import type { TableAdapter } from '../types'

export const financeMovementAdapter: TableAdapter<FinancialMovement> = {
  table: 'finance_movements',
  toRow: (m, userId) => ({
    id: m.id,
    user_id: userId,
    type: m.type,
    amount: m.amount,
    currency: m.currency,
    category: m.category,
    description: m.description,
    date: m.date,
    recurrent: m.recurrent,
    recurrent_period: m.recurrentPeriod ?? null,
    related_goal: m.relatedGoal ?? null,
    tags: m.tags ?? [],
  }),
  fromRow: (row) => ({
    id: row.id as string,
    type: row.type as MovementType,
    amount: Number(row.amount),
    currency: (row.currency as string) ?? 'USD',
    category: row.category as FinancialCategory,
    description: row.description as string,
    date: row.date as string,
    recurrent: Boolean(row.recurrent),
    recurrentPeriod: (row.recurrent_period as string) ?? undefined,
    relatedGoal: (row.related_goal as string) ?? undefined,
    tags: (row.tags as string[]) ?? [],
  }),
}
