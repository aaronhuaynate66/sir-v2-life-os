// SIR V2 — Mapeo PURO de una captura de panel de FC a HealthMetric[].
//
// Aislado de Supabase/store para ser testeable de forma determinista. Lo
// consume persistHeartRateCapture (client.ts) y el branch de /captura.
//
// Decisiones de mapeo (alineadas con la ingesta de Apple Health, parse.ts):
//   - resting_bpm → type 'heart_rate'  : la SEÑAL PRINCIPAL/verdad de FC. Los
//     consumidores leen la FC más reciente por timestamp, así que esta fila
//     CORRIGE el valor manual elevado de Aaron.
//   - min/max     → type 'heart_rate_min' / 'heart_rate_max' : RANGO diario.
//     La FC sube con la actividad → un rango, nunca "el reposo".
//   - avg_bpm     → type 'heart_rate_avg' : promedio del día, si aparece.
//   - dedupe por DÍA: el `id` de cada fila ES "shot:hr:YYYY-MM-DD:<type>". El
//     sync engine upsertea onConflict:'id' → re-capturar el mismo día REEMPLAZA
//     las filas, no duplica. (No usamos las columnas source/external_id: así NO
//     hace falta migración y queda fail-open, igual que la báscula no escribe
//     las columnas de 0049.)
//   - las alertas de FC alta/baja no tienen tipo propio → se guardan legibles
//     en la `note` de la fila de reposo.

import type { HealthMetric, HealthMetricType } from '@/types'
import { parseLocalDate, toIsoLocal } from '@/lib/dates/parseLocalDate'
import type { HeartRateCaptureFinal } from './types'

const UNIT = 'lpm'
const REST_NOTE = 'En reposo · captura FC'
const RANGE_NOTE = 'Rango diario · captura FC'
const AVG_NOTE = 'Promedio del día · captura FC'

/** Prefijo de dedupe por día. Cada fila usa `${base}:${type}` como primary key. */
export function hrDedupeBaseId(day: string): string {
  return `shot:hr:${day}`
}

/** Primary key de una fila concreta (día + tipo de métrica). */
export function hrMetricId(day: string, type: HealthMetricType): string {
  return `${hrDedupeBaseId(day)}:${type}`
}

/**
 * Resuelve el día ('YYYY-MM-DD') del registro. Si el panel no tenía fecha
 * legible o es inválida, cae a `fallbackDay` (el caller lo computa en TZ Lima).
 * Valida por round-trip vía parseLocalDate (rechaza 2026-02-30, etc.).
 */
export function resolveHrDay(
  extractedDate: string | null | undefined,
  fallbackDay: string,
): string {
  const parsed = parseLocalDate(extractedDate)
  if (parsed) return toIsoLocal(parsed)
  return fallbackDay
}

/**
 * Timestamp determinístico para las filas del día: mediodía UTC del día. Estable
 * sin importar la TZ del runtime (mediodía UTC = 07:00 en Lima, mismo día), y
 * comparable cronológicamente entre capturas — la captura de un día más reciente
 * gana como "FC actual". Pure: no usa Date.now().
 */
export function hrTimestampForDay(day: string): string {
  return `${day}T12:00:00.000Z`
}

/** Nota legible para la fila de reposo: confianza + conteo de alertas. */
export function buildRestingNote(
  confidence: 'high' | 'medium' | 'low',
  highAlerts: number | null,
  lowAlerts: number | null,
): string {
  const parts: string[] = [`${REST_NOTE} (conf. ${confidence})`]
  if (highAlerts !== null && highAlerts > 0) parts.push(`${highAlerts} alerta(s) FC alta`)
  if (lowAlerts !== null && lowAlerts > 0) parts.push(`${lowAlerts} alerta(s) FC baja`)
  return parts.join(' · ')
}

/**
 * Construye los HealthMetric a partir de los campos confirmados en el preview.
 * Una fila por dato presente (reposo / min / max / promedio). Determinista y
 * sin efectos: el caller decide cómo persistir.
 *
 * Robustez: si vienen min y max y están invertidos, los reordena.
 */
export function buildHeartRateHealthMetrics(final: HeartRateCaptureFinal): HealthMetric[] {
  const timestamp = hrTimestampForDay(final.day)

  // Reordenar min/max si vinieran invertidos.
  let minBpm = final.minBpm
  let maxBpm = final.maxBpm
  if (minBpm !== null && maxBpm !== null && minBpm > maxBpm) {
    ;[minBpm, maxBpm] = [maxBpm, minBpm]
  }

  const rows: HealthMetric[] = []

  const push = (type: HealthMetricType, value: number | null, note: string) => {
    if (value === null || !Number.isFinite(value)) return
    rows.push({
      id: hrMetricId(final.day, type),
      type,
      value,
      unit: UNIT,
      timestamp,
      note,
    })
  }

  // Reposo PRIMERO: es la verdad que leen los consumidores.
  push('heart_rate', final.restingBpm, buildRestingNote(final.confidence, final.highAlerts, final.lowAlerts))
  push('heart_rate_min', minBpm, RANGE_NOTE)
  push('heart_rate_max', maxBpm, RANGE_NOTE)
  push('heart_rate_avg', final.avgBpm, AVG_NOTE)

  return rows
}
