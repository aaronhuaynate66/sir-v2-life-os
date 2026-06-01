// SIR V2 — Objective step table adapter (migración 0040)
//
// Mapea ObjectiveStep ↔ fila de objective_steps. El campo de dominio `order`
// viaja como columna `sort_order` (ver nota en la migración: `order` es
// reservada en SQL/PostgREST).

import type { ObjectiveStep, ObjectiveStepStatus } from '@/types'
import type { TableAdapter } from '../types'

const VALID_STATUS: readonly ObjectiveStepStatus[] = ['pendiente', 'en_progreso', 'hecho']

function coerceStatus(raw: unknown): ObjectiveStepStatus {
  return typeof raw === 'string' && VALID_STATUS.includes(raw as ObjectiveStepStatus)
    ? (raw as ObjectiveStepStatus)
    : 'pendiente'
}

export const objectiveStepAdapter: TableAdapter<ObjectiveStep> = {
  table: 'objective_steps',
  toRow: (s, userId) => ({
    id: s.id,
    user_id: userId,
    objective_id: s.objectiveId,
    title: s.title,
    description: s.description ?? '',
    target_date: s.targetDate ?? null,
    status: s.status,
    sort_order: s.order,
    created_at: s.createdAt,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    objectiveId: row.objective_id as string,
    title: row.title as string,
    description: (row.description as string) ?? '',
    targetDate: (row.target_date as string) ?? undefined,
    status: coerceStatus(row.status),
    order: Number(row.sort_order) || 0,
    createdAt: row.created_at as string,
  }),
}
