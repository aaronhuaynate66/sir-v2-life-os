// SIR V2 — Tracker table adapters (migración 0051).
//
// Mapean Tracker ↔ fila de `trackers` y TrackerPoint ↔ fila de `tracker_points`.
// Mismo patrón que el resto del store: toRow inyecta user_id; fromRow tolera
// columnas ausentes (data vieja / tabla recién creada) cayendo a defaults.

import type {
  Tracker,
  TrackerConditionKind,
  TrackerPoint,
  TrackerPointSource,
} from '@/types'
import type { TableAdapter } from '../types'

const VALID_CONDITION: readonly TrackerConditionKind[] = ['lte', 'gte', 'days_until_lt']
const VALID_SOURCE: readonly TrackerPointSource[] = ['manual_screenshot', 'manual_text', 'email']

function coerceCondition(raw: unknown): TrackerConditionKind {
  return typeof raw === 'string' && VALID_CONDITION.includes(raw as TrackerConditionKind)
    ? (raw as TrackerConditionKind)
    : 'lte'
}

function coerceSource(raw: unknown): TrackerPointSource {
  return typeof raw === 'string' && VALID_SOURCE.includes(raw as TrackerPointSource)
    ? (raw as TrackerPointSource)
    : 'manual_screenshot'
}

function coerceAlertKind(raw: unknown): 'met' | 'stale' | undefined {
  return raw === 'met' || raw === 'stale' ? raw : undefined
}

/** numeric de Postgres puede llegar como string ("5075.00"); lo normalizamos. */
function num(raw: unknown): number | undefined {
  if (raw == null) return undefined
  const n = typeof raw === 'string' ? Number(raw) : (raw as number)
  return Number.isFinite(n) ? n : undefined
}

export const trackerAdapter: TableAdapter<Tracker> = {
  table: 'trackers',
  toRow: (t, userId) => ({
    id: t.id,
    user_id: userId,
    objective_id: t.objectiveId ?? null,
    objective_step_id: t.objectiveStepId ?? null,
    label: t.label,
    unit: t.unit ?? '',
    current_value: t.currentValue ?? null,
    current_value_date: t.currentValueDate ?? null,
    condition_kind: t.conditionKind,
    condition_value: t.conditionValue,
    condition_date: t.conditionDate ?? null,
    cadence_days: t.cadenceDays ?? null,
    last_updated: t.lastUpdated ?? null,
    last_alert_kind: t.lastAlertKind ?? null,
    last_alert_at: t.lastAlertAt ?? null,
    created_at: t.createdAt,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    objectiveId: (row.objective_id as string) ?? undefined,
    objectiveStepId: (row.objective_step_id as string) ?? undefined,
    label: row.label as string,
    unit: (row.unit as string) ?? '',
    currentValue: num(row.current_value),
    currentValueDate: (row.current_value_date as string) ?? undefined,
    conditionKind: coerceCondition(row.condition_kind),
    conditionValue: num(row.condition_value) ?? 0,
    conditionDate: (row.condition_date as string) ?? undefined,
    cadenceDays: num(row.cadence_days),
    lastUpdated: (row.last_updated as string) ?? undefined,
    lastAlertKind: coerceAlertKind(row.last_alert_kind),
    lastAlertAt: (row.last_alert_at as string) ?? undefined,
    createdAt: row.created_at as string,
  }),
}

export const trackerPointAdapter: TableAdapter<TrackerPoint> = {
  table: 'tracker_points',
  toRow: (p, userId) => ({
    id: p.id,
    user_id: userId,
    tracker_id: p.trackerId,
    value: p.value,
    date: p.date,
    source: p.source,
    note: p.note ?? '',
    created_at: p.createdAt,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    trackerId: row.tracker_id as string,
    value: num(row.value) ?? 0,
    date: row.date as string,
    source: coerceSource(row.source),
    note: (row.note as string) || undefined,
    createdAt: row.created_at as string,
  }),
}
