// SIR V2 — Horas efectivas de sueño (SF·F3).
//
// El corazón de "8h picadas ≠ 8h limpias": descuenta la duración por la CALIDAD
// (fragmentación + fase reparadora) para estimar cuántas horas REALMENTE
// recuperaste. Alimenta una deuda ajustada por calidad, para que dos noches de
// las mismas horas pero distinta calidad NO paguen deuda igual.
//
// HONESTO: si la noche no trae señal de calidad, el factor es 1 (no descuenta lo
// que no puede ver) y `adjusted` queda en false. PURO y determinístico.

import type { SleepRecord } from '@/types'
import { readSleepQuality } from './quality'
import { accumulatedSleepDebt, type SleepDebtResult } from './debt'

/** La calidad nunca descuenta más del 30% (piso 0.7): incluso una noche mala
 *  aporta algo de recuperación. */
const FACTOR_FLOOR = 0.7
/** Fracción reparadora (profundo+REM) de una noche sana. */
const TARGET_RESTORATIVE = 0.45
/** Piso del factor de continuidad (los despertares solos no matan la noche). */
const CONTINUITY_FLOOR = 0.85

export interface EffectiveSleep {
  rawHours: number
  /** Horas efectivas de recuperación (rawHours × factor), 1 decimal. */
  effectiveHours: number
  /** Factor de calidad aplicado (1 = sin descuento), 2 decimales. */
  factor: number
  /** true si HAY señal de calidad y descuenta de verdad (< ~1). */
  adjusted: boolean
  /** Motivos legibles del descuento. */
  reasons: string[]
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Estima las horas EFECTIVAS de recuperación de una noche descontando su
 * duración por calidad (fragmentación + fase reparadora).
 */
export function effectiveSleepHours(record: SleepRecord): EffectiveSleep {
  const q = readSleepQuality(record)
  const reasons: string[] = []
  let factor = 1

  // Fase reparadora: por debajo del objetivo, descuenta hacia el piso.
  if (q.restorativePct !== null) {
    const rf = clamp(q.restorativePct / TARGET_RESTORATIVE, FACTOR_FLOOR, 1)
    factor *= rf
    if (rf < 1) reasons.push(`poco reparador (${Math.round(q.restorativePct * 100)}% profundo+REM)`)
  }

  // Continuidad: cada despertar/hora por encima de 1 cuesta 5%, con piso.
  if (q.fragmentation !== null) {
    const cf = clamp(1 - Math.max(0, q.fragmentation - 1) * 0.05, CONTINUITY_FLOOR, 1)
    factor *= cf
    if (cf < 1) reasons.push(`${q.awakenings} despertares`)
  }

  factor = clamp(factor, FACTOR_FLOOR, 1)
  return {
    rawHours: record.duration,
    effectiveHours: round1(record.duration * factor),
    factor: round2(factor),
    adjusted: q.hasRichData && factor < 0.995,
    reasons,
  }
}

/**
 * Deuda de sueño AJUSTADA POR CALIDAD: reusa el modelo de 11·M1 pero alimentado
 * con las horas efectivas en vez de las brutas. Una noche fragmentada paga menos
 * deuda que una noche limpia de las mismas horas.
 */
export function qualityAdjustedDebt(records: SleepRecord[], nowMs: number): SleepDebtResult {
  const adjusted = records.map((r) => ({
    date: r.date,
    duration: effectiveSleepHours(r).effectiveHours,
  }))
  return accumulatedSleepDebt(adjusted, nowMs)
}
