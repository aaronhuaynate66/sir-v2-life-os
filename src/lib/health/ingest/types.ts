// SIR V2 — Tipos del ingest de Apple Health (vía "Health Auto Export" REST API).
//
// "Health Auto Export" (app de iOS) exporta automáticamente por HTTP POST con
// el shape:
//   { data: { metrics: [ { name, units, data: [ { date, qty | value | Avg, ... } ] } ], workouts? } }
//
// Las métricas de sueño (name='sleep_analysis') traen data points con campos
// extra (sleepStart/sleepEnd, asleep/totalSleep, deep/core/rem/awake, ...).
//
// Estos tipos describen el payload de ENTRADA (laxo, defensivo: todo opcional /
// unknown porque viene de afuera) y el resultado NORMALIZADO de salida que el
// route persiste en health_metrics / sleep_records.

import type { HealthMetricType } from '@/types'

// ─── Payload crudo de Health Auto Export (entrada, no confiable) ──────

/** Un data point individual dentro de una métrica. Campos varían por métrica
 *  y por versión de la app — todos opcionales. */
export interface HAEDataPoint {
  /** "2026-06-02 06:34:00 -0500" (local con offset) o ISO. */
  date?: string
  /** Valor escalar de la mayoría de métricas (pasos, peso, kcal, ...). */
  qty?: number
  /** Algunas builds usan `value` en vez de `qty`. */
  value?: number | string
  /** Métricas con agregación intradía (heart_rate): mayúscula en HAE. */
  Avg?: number
  Min?: number
  Max?: number
  /** ── Campos de sleep_analysis ── */
  sleepStart?: string
  sleepEnd?: string
  inBedStart?: string
  inBedEnd?: string
  /** Horas dormidas (formato viejo). */
  asleep?: number
  /** Horas dormidas totales (formato nuevo). */
  totalSleep?: number
  /** Horas en cama. */
  inBed?: number
  /** Etapas (horas) — formato nuevo. */
  deep?: number
  core?: number
  rem?: number
  awake?: number
  [k: string]: unknown
}

export interface HAEMetric {
  name?: string
  units?: string
  data?: HAEDataPoint[]
}

export interface HealthAutoExportPayload {
  data?: {
    metrics?: HAEMetric[]
    [k: string]: unknown
  }
  /** Algunas automatizaciones mandan `metrics` en la raíz. */
  metrics?: HAEMetric[]
  [k: string]: unknown
}

// ─── Resultado normalizado (salida del parser, entrada del route) ─────

/** Una métrica de salud lista para upsert en health_metrics. */
export interface NormalizedHealthMetric {
  type: HealthMetricType
  /** Valor ya redondeado a 2 decimales. */
  value: number
  unit: string
  /** ISO 8601 con offset (measured_at). */
  measuredAt: string
  /** 'YYYY-MM-DD' local — día del dato (para el external_id y debugging). */
  day: string
  /** Clave de dedupe: "ah:<haeName>:<day>". */
  externalId: string
  note?: string
}

/** Una noche de sueño lista para upsert en sleep_records. */
export interface NormalizedSleepRecord {
  /** 'YYYY-MM-DD' del despertar. */
  date: string
  /** "HH:mm" de inicio de sueño. */
  bedtime: string
  /** "HH:mm" de despertar. */
  wakeTime: string
  /** Horas dormidas (clamp 0-24, 2 decimales). */
  duration: number
  /** Calidad 1-10 (de la puntuación de sueño 0-100 si existe, si no derivada). */
  quality: number
  /** Clave de dedupe: "ah:sleep:<date>". */
  externalId: string
  notes?: string
}

/** Resultado completo de mapear un payload de Health Auto Export. */
export interface IngestMapResult {
  healthMetrics: NormalizedHealthMetric[]
  sleepRecords: NormalizedSleepRecord[]
  /** Nombres de métricas presentes en el payload pero NO mapeadas (para el
   *  diagnóstico en la respuesta del endpoint). Únicos, ordenados. */
  skipped: string[]
}
