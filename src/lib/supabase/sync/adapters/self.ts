// SIR V2 — Self store adapters (Sesión 20c)
// One store, three tables: self_metrics, health_metrics, sleep_records.

import type { SelfMetric, HealthMetric, SleepRecord, SelfDiagnosis, MetricCategory, HealthMetricType } from '@/types'
import type { TableAdapter } from '../types'

/** Coerce un valor de DB a string[] (Postgres text[] llega como array). */
function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export const selfMetricAdapter: TableAdapter<SelfMetric> = {
  table: 'self_metrics',
  toRow: (m, userId) => ({
    id: m.id,
    user_id: userId,
    category: m.category,
    value: m.value,
    note: m.note ?? null,
    measured_at: m.timestamp,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    category: row.category as MetricCategory,
    value: Number(row.value),
    note: (row.note as string) ?? undefined,
    timestamp: row.measured_at as string,
  }),
}

export const healthMetricAdapter: TableAdapter<HealthMetric> = {
  table: 'health_metrics',
  toRow: (m, userId) => ({
    id: m.id,
    user_id: userId,
    type: m.type,
    value: m.value,
    unit: m.unit,
    note: m.note ?? null,
    measured_at: m.timestamp,
    capture_id: m.captureId ?? null,
    source_image_path: m.sourceImagePath ?? null,
    capture_type: m.captureType ?? null,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    type: row.type as HealthMetricType,
    value: Number(row.value),
    unit: row.unit as string,
    note: (row.note as string) ?? undefined,
    timestamp: row.measured_at as string,
    captureId: (row.capture_id as string) ?? undefined,
    sourceImagePath: (row.source_image_path as string) ?? undefined,
    captureType: (row.capture_type as 'scale' | 'whatsapp') ?? undefined,
  }),
}

// Diagnóstico personal: singleton por usuario, sincronizado como slice-array
// de 0 o 1 fila (ver useSelfStore). Data sensible — solo viaja a su tabla RLS.
export const selfDiagnosisAdapter: TableAdapter<SelfDiagnosis> = {
  table: 'self_diagnosis',
  toRow: (d, userId) => ({
    id: d.id,
    user_id: userId,
    emotional_state: d.emotionalState,
    anxieties: d.anxieties,
    blocks: d.blocks,
    stopped_tolerating: d.stoppedTolerating,
    understandings: d.understandings,
    anchors: d.anchors,
    ideal_life_vision: d.idealLifeVision,
    future_self: d.futureSelf,
    updated_at: d.updatedAt,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    emotionalState: (row.emotional_state as string) ?? '',
    anxieties: toStringArray(row.anxieties),
    blocks: toStringArray(row.blocks),
    stoppedTolerating: toStringArray(row.stopped_tolerating),
    understandings: toStringArray(row.understandings),
    anchors: toStringArray(row.anchors),
    idealLifeVision: (row.ideal_life_vision as string) ?? '',
    futureSelf: (row.future_self as string) ?? '',
    updatedAt: (row.updated_at as string) ?? new Date(0).toISOString(),
  }),
}

export const sleepRecordAdapter: TableAdapter<SleepRecord> = {
  table: 'sleep_records',
  toRow: (s, userId) => ({
    id: s.id,
    user_id: userId,
    date: s.date,
    bedtime: s.bedtime,
    wake_time: s.wakeTime,
    duration: s.duration,
    quality: s.quality,
    dreams: s.dreams ?? null,
    notes: s.notes ?? null,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    date: row.date as string,
    bedtime: row.bedtime as string,
    wakeTime: row.wake_time as string,
    duration: Number(row.duration),
    quality: Number(row.quality),
    dreams: (row.dreams as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
  }),
}
