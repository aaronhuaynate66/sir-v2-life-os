// SIR V2 — Evaluación PURA de un tracker: condición/umbral, tendencia, vejez.
//
// Todo determinístico y testeable. El `now: Date` se inyecta (nunca Date.now()
// adentro) para que los tests sean estables y el cron pueda evaluar "como si
// fuera" otro momento.

import type { Tracker, TrackerConditionKind, TrackerPoint } from '@/types'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

/** Estado de un tracker frente a su condición. */
export type TrackerStatus =
  | 'met' // condición cumplida (¡comprá! / ¡llegó!)
  | 'stale' // la última lectura es más vieja que la cadencia → actualizar
  | 'tracking' // hay datos, condición aún no cumplida
  | 'no_data' // todavía no hay valor

export interface ConditionResult {
  met: boolean
  /** Para days_until_lt: días que faltan hasta conditionDate (con signo). */
  daysUntil: number | null
}

const DAY_MS = 86_400_000

/** Días (con signo) desde hoy hasta una fecha date-only. null si no hay fecha. */
export function daysUntil(dateIso: string | undefined, now: Date): number | null {
  const d = parseLocalDate(dateIso)
  if (!d) return null
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((d.getTime() - todayStart.getTime()) / DAY_MS)
}

/**
 * ¿Se cumple la condición del tracker ahora mismo?
 *   - lte           : currentValue ≤ conditionValue
 *   - gte           : currentValue ≥ conditionValue
 *   - days_until_lt : (conditionDate - hoy) < conditionValue días
 * Si falta el dato necesario (valor o fecha), met=false.
 */
export function evaluateCondition(tracker: Tracker, now: Date): ConditionResult {
  if (tracker.conditionKind === 'days_until_lt') {
    const du = daysUntil(tracker.conditionDate, now)
    if (du == null) return { met: false, daysUntil: null }
    return { met: du < tracker.conditionValue, daysUntil: du }
  }

  const v = tracker.currentValue
  if (v == null) return { met: false, daysUntil: null }
  if (tracker.conditionKind === 'lte') return { met: v <= tracker.conditionValue, daysUntil: null }
  // gte
  return { met: v >= tracker.conditionValue, daysUntil: null }
}

/** ¿La última lectura es más vieja que la cadencia configurada? */
export function isStale(tracker: Tracker, now: Date): boolean {
  if (!tracker.cadenceDays || tracker.cadenceDays <= 0) return false
  // days_until_lt no depende de lecturas manuales: nunca es "viejo".
  if (tracker.conditionKind === 'days_until_lt') return false
  const last = tracker.currentValueDate ?? tracker.lastUpdated
  const du = daysUntil(last?.slice(0, 10), now)
  if (du == null) return tracker.currentValue == null ? false : true
  // du es negativo (fecha pasada). Vieja si pasaron más días que la cadencia.
  return -du > tracker.cadenceDays
}

/**
 * Estado global del tracker. 'met' tiene prioridad sobre 'stale' (si la
 * condición ya se cumplió, da igual que la lectura sea vieja: avisamos lo bueno).
 */
export function trackerStatus(tracker: Tracker, now: Date): TrackerStatus {
  const cond = evaluateCondition(tracker, now)
  if (cond.met) return 'met'
  if (tracker.conditionKind !== 'days_until_lt' && tracker.currentValue == null) return 'no_data'
  if (isStale(tracker, now)) return 'stale'
  return 'tracking'
}

export interface TrendResult {
  direction: 'up' | 'down' | 'flat' | null
  /** Diferencia entre el último y el penúltimo punto distinto. null si <2 puntos. */
  delta: number | null
  /** ¿El movimiento ACERCA a cumplir la condición? (down si lte, up si gte). */
  favorable: boolean | null
}

/**
 * Tendencia entre los dos últimos puntos de la serie. `points` no necesita estar
 * ordenado. Para lte (queremos que BAJE) un delta negativo es favorable; para
 * gte (queremos que SUBA) un delta positivo es favorable.
 */
export function computeTrend(points: TrackerPoint[], conditionKind: TrackerConditionKind): TrendResult {
  if (points.length < 2) return { direction: null, delta: null, favorable: null }
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const last = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]
  const delta = last.value - prev.value
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  let favorable: boolean | null = null
  if (direction !== 'flat') {
    if (conditionKind === 'lte') favorable = direction === 'down'
    else if (conditionKind === 'gte') favorable = direction === 'up'
    // days_until_lt: la tendencia del valor no aplica a la condición de tiempo.
  }
  return { direction, delta, favorable }
}

/** Texto humano de la condición, ej. "≤ 4500 PEN" o "< 30 días para 2026-07-15". */
export function conditionLabel(tracker: Tracker): string {
  const unit = tracker.unit ? ` ${tracker.unit}` : ''
  switch (tracker.conditionKind) {
    case 'lte':
      return `≤ ${tracker.conditionValue}${unit}`
    case 'gte':
      return `≥ ${tracker.conditionValue}${unit}`
    case 'days_until_lt':
      return tracker.conditionDate
        ? `< ${tracker.conditionValue} días para ${tracker.conditionDate}`
        : `< ${tracker.conditionValue} días`
  }
}

/** Frase corta del estado, para chips/alertas. */
export function statusLabel(status: TrackerStatus): string {
  switch (status) {
    case 'met':
      return 'cumplido'
    case 'stale':
      return 'desactualizado'
    case 'tracking':
      return 'en seguimiento'
    case 'no_data':
      return 'sin datos'
  }
}
