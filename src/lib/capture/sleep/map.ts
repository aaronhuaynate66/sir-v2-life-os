// SIR V2 — Mapeo PURO de una captura de panel de sueño a SleepRecord.
//
// Aislado de Supabase/store para ser testeable de forma determinista. Lo
// consume persistSleepCapture (client.ts) y el branch de /captura.
//
// Decisiones de mapeo (alineadas con la ingesta de Apple Health, parse.ts):
//   - `duration` se guarda en HORAS decimales (toda la app lo asume así:
//     /yo "Sueño prom.", motor biológico, chart de horas).
//   - `quality` es 1-10 en TODO SIR (/yo muestra "/10", el form manual valida
//     1-10, el motor biológico usa umbral <5). El panel da un score 0-100 →
//     lo CONVERTIMOS a 1-10 con qualityFromScore (igual que la ingesta de
//     Apple). Si no hay score, derivamos de la duración.
//   - dedupe por DÍA: el `id` del row ES la clave "shot:sleep:YYYY-MM-DD".
//     El sync engine upsertea onConflict:'id' → re-capturar la misma noche
//     REEMPLAZA el row, no duplica. (No usamos la columna external_id ni un
//     `source` nuevo: así NO hace falta migración y queda fail-open, igual que
//     la báscula no escribe las columnas de 0049.)
//   - las FASES no tienen columnas propias → se guardan legibles en `notes`.

import type { SleepRecord } from '@/types'
import { qualityFromScore, qualityFromDuration } from '@/lib/health/ingest/parse'
import { parseLocalDate, toIsoLocal } from '@/lib/dates/parseLocalDate'
import type { SleepCaptureFinal, SleepStageMinutes } from './types'

/** Clave de dedupe por día (= primary key del row). */
export function sleepDedupeId(day: string): string {
  return `shot:sleep:${day}`
}

/**
 * Resuelve el día ('YYYY-MM-DD') del registro. Si el panel no tenía fecha
 * legible o es inválida, cae a `fallbackDay` (el caller lo computa en TZ Lima).
 * Valida por round-trip vía parseLocalDate (rechaza 2026-02-30, etc.).
 */
export function resolveSleepDay(
  extractedDate: string | null | undefined,
  fallbackDay: string,
): string {
  const parsed = parseLocalDate(extractedDate)
  if (parsed) return toIsoLocal(parsed)
  return fallbackDay
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** "1h21m" / "28m" / "6m". Devuelve null si no hay minutos. */
function fmtMin(min: number | null): string | null {
  if (min === null || !Number.isFinite(min) || min <= 0) return null
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h > 0 && m > 0) return `${h}h${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** Nota legible con fases + score + confianza, para guardar en sleep_records.notes. */
export function buildSleepNotes(
  stages: SleepStageMinutes,
  score: number | null,
  confidence: 'high' | 'medium' | 'low',
): string {
  const parts: string[] = [`Captura sueño (pantallazo, conf. ${confidence})`]
  if (score !== null) parts.push(`score ${score}/100`)
  const deep = fmtMin(stages.deep_minutes)
  const light = fmtMin(stages.light_minutes)
  const rem = fmtMin(stages.rem_minutes)
  const awake = fmtMin(stages.awake_minutes)
  if (deep) parts.push(`Profundo ${deep}`)
  if (light) parts.push(`Liviano ${light}`)
  if (rem) parts.push(`REM ${rem}`)
  if (awake) parts.push(`Vigilia ${awake}`)
  return parts.join(' · ')
}

/**
 * Construye un SleepRecord a partir de los campos confirmados en el preview.
 * Determinista y sin efectos: el caller decide cómo persistir.
 */
export function buildSleepRecordFromPanel(final: SleepCaptureFinal): SleepRecord {
  const duration = round2(clamp(final.totalMinutes / 60, 0, 24))
  const quality =
    final.score !== null ? qualityFromScore(final.score) : qualityFromDuration(duration)

  return {
    id: sleepDedupeId(final.day),
    date: final.day,
    bedtime: final.bedtime ?? '00:00',
    wakeTime: final.wakeTime ?? '00:00',
    duration,
    quality,
    notes: buildSleepNotes(final.stages, final.score, final.confidence),
  }
}
