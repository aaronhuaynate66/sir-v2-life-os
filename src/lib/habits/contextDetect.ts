// SIR V2 — Hábitos 12·M4: detección del contexto de una conducta (Wood & Neal /
// Duhigg). Confianza media-baja.
//
// Mira CUÁNDO se completaron las tareas de un objetivo y detecta la franja
// típica que las precede. Con eso propone un `plan_if` FUNDADO ("solés avanzar
// esto por la mañana") — como PROPUESTA EDITABLE, nunca como afirmación ni como
// formulario vacío. Honesto con el volumen: con pocas marcas la confianza es
// "orientativa", no "sugerida". PURO: la conversión a reloj Lima vive acá.

import { LIMA_UTC_OFFSET_HOURS } from '@/lib/calendar/tz'
import { franjaOfHour, FRANJA_LABEL, type Franja } from './timeContext'

export interface CompletionMark {
  /** ISO timestamp de cuándo se completó (objective_steps.completed_at). */
  completedAt: string
}

export interface ContextProposal {
  franja: Franja
  /** Hora modal (0-23, reloj Lima) dentro de la franja. */
  hour: number
  /** Marcas que respaldan la franja modal. */
  support: number
  /** Total de marcas válidas consideradas. */
  total: number
  /** 'sugerida' con volumen decente; 'orientativa' con poco. */
  confidence: 'orientativa' | 'sugerida'
  /** Texto propuesto para plan_if (editable). */
  planIf: string
}

const MIN_MARKS = 3
const HOUR_MS = 3_600_000

/** ISO → hora de pared de Lima (0-23), o null si inválido. */
function limaHour(iso: string): number | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return new Date(t - LIMA_UTC_OFFSET_HOURS * HOUR_MS).getUTCHours()
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Detecta la franja típica en que se completan las tareas y arma una propuesta
 * editable de plan_if. null si no hay señal suficiente (n < 3 o sin franja modal
 * clara). PURO.
 */
export function detectContext(marks: CompletionMark[]): ContextProposal | null {
  const hours: number[] = []
  for (const m of marks) {
    const h = limaHour(m.completedAt)
    if (h != null) hours.push(h)
  }
  const total = hours.length
  if (total < MIN_MARKS) return null

  // Contar por franja + por hora.
  const byFranja = new Map<Franja, number>()
  const byHour = new Map<number, number>()
  for (const h of hours) {
    const f = franjaOfHour(h)
    byFranja.set(f, (byFranja.get(f) ?? 0) + 1)
    byHour.set(h, (byHour.get(h) ?? 0) + 1)
  }

  // Franja modal.
  let franja: Franja | null = null
  let support = 0
  for (const [f, c] of byFranja) {
    if (c > support) { franja = f; support = c }
  }
  if (!franja) return null
  // Requiere un cluster real: la mayoría en esa franja, o al menos 3 marcas.
  if (support < 3 && support / total < 0.5) return null

  // Hora modal DENTRO de la franja.
  let hour = 0
  let hourCount = -1
  for (const h of hours) {
    if (franjaOfHour(h) !== franja) continue
    const c = byHour.get(h) ?? 0
    if (c > hourCount) { hourCount = c; hour = h }
  }

  const confidence = support >= 5 ? 'sugerida' : 'orientativa'
  const planIf = `${capitalize(FRANJA_LABEL[franja])} (~${hour}h)`
  return { franja, hour, support, total, confidence, planIf }
}
