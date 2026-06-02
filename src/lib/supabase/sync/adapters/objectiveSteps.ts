// SIR V2 — Objective step table adapter (migración 0040 + 0041 OKR)
//
// Mapea ObjectiveStep ↔ fila de objective_steps. El campo de dominio `order`
// viaja como columna `sort_order` (ver nota en 0040: `order` es reservada en
// SQL/PostgREST). El nivel OKR viaja en `kind` ('key_result' | 'task') y el KR
// padre de una tarea en `parent_id` (FK self, 0041).
//
// Tolerante a data pre-0041: si la fila no trae `kind`/`parent_id` (columnas aún
// no creadas), fromRow cae a kind='key_result'/parentId ausente — el paso viejo
// se reinterpreta como KR del objetivo, sin tareas.

import type { ObjectiveStep, ObjectiveStepKind, ObjectiveStepStatus } from '@/types'
import type { TableAdapter } from '../types'

const VALID_STATUS: readonly ObjectiveStepStatus[] = ['pendiente', 'en_progreso', 'hecho']

function coerceStatus(raw: unknown): ObjectiveStepStatus {
  return typeof raw === 'string' && VALID_STATUS.includes(raw as ObjectiveStepStatus)
    ? (raw as ObjectiveStepStatus)
    : 'pendiente'
}

function coerceKind(raw: unknown): ObjectiveStepKind {
  return raw === 'task' ? 'task' : 'key_result'
}

export const objectiveStepAdapter: TableAdapter<ObjectiveStep> = {
  table: 'objective_steps',
  toRow: (s, userId) => ({
    id: s.id,
    user_id: userId,
    objective_id: s.objectiveId,
    // Coerce: data persistida pre-0041 (localStorage) puede no traer `kind`.
    // Sin esto, un upsert de ese paso viejo mandaría kind=undefined.
    kind: coerceKind(s.kind),
    parent_id: s.parentId ?? null,
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
    kind: coerceKind(row.kind),
    parentId: (row.parent_id as string) ?? undefined,
    title: row.title as string,
    description: (row.description as string) ?? '',
    targetDate: (row.target_date as string) ?? undefined,
    status: coerceStatus(row.status),
    order: Number(row.sort_order) || 0,
    createdAt: row.created_at as string,
  }),
}
