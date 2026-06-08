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

import type {
  ObjectiveStep,
  ObjectiveStepKind,
  ObjectiveStepStatus,
  TaskEffort,
  TaskPriority,
  TaskStatus,
} from '@/types'
import type { TableAdapter } from '../types'

const VALID_STATUS: readonly ObjectiveStepStatus[] = ['pendiente', 'en_progreso', 'hecho']
function coerceNum(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : undefined
}

const VALID_TASK_STATUS: readonly TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']
const VALID_EFFORT: readonly TaskEffort[] = ['S', 'M', 'L']
const VALID_PRIORITY: readonly TaskPriority[] = ['low', 'med', 'high']

function coerceStatus(raw: unknown): ObjectiveStepStatus {
  return typeof raw === 'string' && VALID_STATUS.includes(raw as ObjectiveStepStatus)
    ? (raw as ObjectiveStepStatus)
    : 'pendiente'
}

function coerceKind(raw: unknown): ObjectiveStepKind {
  return raw === 'task' ? 'task' : 'key_result'
}

/** Valida un enum nullable de la fila: devuelve el valor o undefined. */
function coerceEnum<T extends string>(raw: unknown, valid: readonly T[]): T | undefined {
  return typeof raw === 'string' && valid.includes(raw as T) ? (raw as T) : undefined
}

/** blocked_by viaja como text[] / jsonb; toleramos null, array o ausencia. */
function coerceBlockedBy(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const ids = raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
  return ids.length > 0 ? ids : undefined
}

/** due_time (0061): 'HH:MM' 24h válido o undefined (tolera null / formato raro). */
const DUE_TIME_RE = /^(\d{2}):(\d{2})$/
function coerceDueTime(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const m = DUE_TIME_RE.exec(raw)
  if (!m) return undefined
  return Number(m[1]) > 23 || Number(m[2]) > 59 ? undefined : raw
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
    // Hora del día (0061): 'HH:MM' o null. Solo en tareas; en KRs va null.
    due_time: s.dueTime ?? null,
    status: s.status,
    sort_order: s.order,
    created_at: s.createdAt,
    // Campos Jira-light (0050). Solo tienen sentido en tareas; en KRs van null.
    acceptance_criteria: s.acceptanceCriteria ?? null,
    effort: s.effort ?? null,
    priority: s.priority ?? null,
    task_status: s.taskStatus ?? null,
    blocked_by: s.blockedBy ?? null,
    metric_target: s.metricTarget ?? null,
    metric_current: s.metricCurrent ?? null,
    metric_unit: s.metricUnit ?? null,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    objectiveId: row.objective_id as string,
    kind: coerceKind(row.kind),
    parentId: (row.parent_id as string) ?? undefined,
    title: row.title as string,
    description: (row.description as string) ?? '',
    targetDate: (row.target_date as string) ?? undefined,
    dueTime: coerceDueTime(row.due_time),
    status: coerceStatus(row.status),
    order: Number(row.sort_order) || 0,
    createdAt: row.created_at as string,
    acceptanceCriteria: (row.acceptance_criteria as string) || undefined,
    effort: coerceEnum<TaskEffort>(row.effort, VALID_EFFORT),
    priority: coerceEnum<TaskPriority>(row.priority, VALID_PRIORITY),
    taskStatus: coerceEnum<TaskStatus>(row.task_status, VALID_TASK_STATUS),
    blockedBy: coerceBlockedBy(row.blocked_by),
    metricTarget: coerceNum(row.metric_target),
    metricCurrent: coerceNum(row.metric_current),
    metricUnit: (row.metric_unit as string) || undefined,
  }),
}
