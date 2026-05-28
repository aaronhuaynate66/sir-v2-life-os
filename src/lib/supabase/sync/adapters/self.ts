// SIR V2 — Self store adapters (Sesión 20c)
// One store, three tables: self_metrics, health_metrics, sleep_records.

import type { SelfMetric, HealthMetric, SleepRecord, MetricCategory, HealthMetricType } from '@/types'
import type { TableAdapter } from '../types'

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
