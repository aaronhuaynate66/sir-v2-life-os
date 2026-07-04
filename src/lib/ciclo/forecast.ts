// SIR V2 — Anticipación de cuidado + predicción como ventana (17·M2 + 17·M5). PURO.
//
// M2: aviso PRIVADO a Aaron cuando la pareja ENTRARÁ en ~N días en la ventana
// premenstrual — para preparar un gesto de presencia, nunca "tratarla distinto".
// Solo si la predicción es firme (confianza suficiente); con ciclo irregular no
// anticipamos una fecha que no tenemos.
// M5: en vez de una fecha exacta para el próximo período, una VENTANA (± días
// según la irregularidad de M4). Nunca como método anticonceptivo.
//
// LÍNEA ÉTICA (doc 17): cuidar/atunarse, NUNCA descalificar. Data sensible.

import type { PredictionConfidence } from './regularity'

/** Días previos al período que consideramos "ventana premenstrual". */
const PMS_WINDOW_DAYS = 5
/** Ventana de anticipación: avisamos entre 1 y N días antes de que empiece. */
const ANTICIPATE_WITHIN = 4

export interface CareAnticipation {
  show: boolean
  /** Días hasta que empieza la ventana premenstrual, o null. */
  daysUntilPms: number | null
  message: string | null
}

/**
 * Anticipa con amabilidad la ventana premenstrual. No dispara si ya está dentro
 * (eso lo cubre la card de M1) ni si la predicción es floja. PURO.
 */
export function careAnticipation(input: {
  daysUntilNextPeriod: number
  isPmsWindow: boolean
  confidence: PredictionConfidence
}): CareAnticipation {
  const off = { show: false, daysUntilPms: null, message: null } as CareAnticipation
  if (input.isPmsWindow) return off // ya adentro → lo cubre M1
  if (input.confidence === 'insufficient' || input.confidence === 'low') return off // sin firmeza no anticipamos

  const daysUntilPms = input.daysUntilNextPeriod - PMS_WINDOW_DAYS
  if (daysUntilPms >= 1 && daysUntilPms <= ANTICIPATE_WITHIN) {
    return {
      show: true,
      daysUntilPms,
      message: `En ~${daysUntilPms} día${daysUntilPms === 1 ? '' : 's'} puede empezar una semana más sensible. Un gesto de presencia planeado suma — no es tratarla distinto, es estar más atento.`,
    }
  }
  return { ...off, daysUntilPms }
}

const DAY_MS = 86_400_000
function pad2(n: number): string { return String(n).padStart(2, '0') }

/** Suma `delta` días a una fecha 'YYYY-MM-DD' (UTC), devuelve 'YYYY-MM-DD'. */
function shiftDate(dateIso: string, delta: number): string | null {
  const t = Date.parse(`${dateIso}T00:00:00Z`)
  if (!Number.isFinite(t)) return null
  const d = new Date(t + delta * DAY_MS)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export interface PredictionWindow {
  from: string
  to: string
}

/**
 * Convierte una fecha de predicción + banda en una VENTANA [from, to]. Devuelve
 * null si la banda es 0 (no hay incertidumbre que expresar) o la fecha es inválida.
 */
export function predictionWindow(nextPeriodIso: string, bandDays: number): PredictionWindow | null {
  if (!Number.isFinite(bandDays) || bandDays <= 0) return null
  const from = shiftDate(nextPeriodIso, -bandDays)
  const to = shiftDate(nextPeriodIso, bandDays)
  if (!from || !to) return null
  return { from, to }
}
