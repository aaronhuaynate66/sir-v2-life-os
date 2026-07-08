// SIR V2 — "Mejor fecha para un viaje/plan largo". PURO.
//
// Barre las ventanas de un rango y las rankea por el ciclo de la persona: prioriza
// tramos de más energía/ánimo y menos días de SPM/menstruación — para que ELLA
// llegue con resto a disfrutar el viaje. Es CUIDADO, no ventaja (doc 17): "¿cuándo
// la va a pasar mejor?", nunca "cuándo va a decir que sí". Tendencia, no certeza;
// la incertidumbre crece con la distancia y se recalibra con cada período.

import { cyclePhase, type CyclePhaseId } from './phase'
import { toneProfile } from './horizon'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

const DAY_MS = 86_400_000

export interface TravelWindow {
  startIso: string
  endIso: string
  days: number
  /** Energía media típica 0..1 sobre la ventana (perfil por fase). */
  avgEnergy: number
  /** Días de la ventana en SPM o menstruación (menos resto). */
  lowDays: number
  /** Fase del día del medio de la ventana (para etiquetar). */
  midPhase: CyclePhaseId
  midIsPms: boolean
  /** Score compuesto (mayor = mejor tramo para viajar). */
  score: number
  /** ± días de incertidumbre de la fase (crece con la distancia). */
  uncertaintyDays: number
  isWeekend: boolean
}

const PHASE_LABEL: Record<CyclePhaseId, string> = {
  menstrual: 'menstrual', follicular: 'folicular', ovulation: 'ovulación', luteal: 'lútea',
}

/** Etiqueta legible de la ventana: fase + calidad de energía. */
export function windowLabel(w: TravelWindow): string {
  const energy = w.avgEnergy >= 0.75 ? 'energía alta' : w.avgEnergy >= 0.5 ? 'energía media' : 'energía baja'
  const phase = w.midIsPms ? 'SPM' : PHASE_LABEL[w.midPhase]
  return `${phase} · ${energy}${w.lowDays > 0 ? ` · ${w.lowDays}d de menos resto` : ''}`
}

function isoOf(t: number): string {
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
/** Día de semana (0=dom..6=sáb) de una fecha date-only, en local. */
function weekday(iso: string): number {
  const d = parseLocalDate(iso)
  return d ? d.getDay() : 0
}

export interface RankTravelInput {
  lastPeriodStart: string
  cycleLengthDays: number
  bandDays: number
  fromIso: string
  toIso: string
  /** Largo del viaje en días (default 3 = finde largo). */
  tripDays?: number
  /** Solo ventanas que arrancan viernes (findes). */
  onlyWeekends?: boolean
  now?: Date
  limit?: number
}

/**
 * Rankea las ventanas de viaje del rango por calidad del ciclo. PURO.
 * Devuelve las mejores primero. [] si faltan datos.
 */
export function rankTravelWindows(input: RankTravelInput): TravelWindow[] {
  const start = parseLocalDate(input.lastPeriodStart)
  if (!start) return []
  const length = Math.max(15, Math.min(60, Math.round(input.cycleLengthDays || 28)))
  const band = Math.max(0, Math.round(input.bandDays || 0))
  const tripDays = Math.max(1, Math.min(21, Math.round(input.tripDays ?? 3)))
  const fromT = Date.parse(`${input.fromIso}T00:00:00Z`)
  const toT = Date.parse(`${input.toIso}T00:00:00Z`)
  const startT = Date.parse(`${input.lastPeriodStart}T00:00:00Z`)
  if (!Number.isFinite(fromT) || !Number.isFinite(toT) || toT < fromT) return []

  const windows: TravelWindow[] = []
  for (let s = fromT; s <= toT - (tripDays - 1) * DAY_MS; s += DAY_MS) {
    const startIso = isoOf(s)
    const isWeekend = weekday(startIso) === 5 // viernes
    if (input.onlyWeekends && !isWeekend) continue

    let sumEnergy = 0
    let lowDays = 0
    let valid = 0
    for (let i = 0; i < tripDays; i++) {
      const dIso = isoOf(s + i * DAY_MS)
      const cp = cyclePhase(input.lastPeriodStart, length, parseLocalDate(dIso)!)
      if (!cp) continue
      valid++
      sumEnergy += toneProfile(cp.cycleDay, length)
      if (cp.isPmsWindow || cp.phase === 'menstrual') lowDays++
    }
    if (valid === 0) continue
    const avgEnergy = sumEnergy / valid
    const midIso = isoOf(s + Math.floor(tripDays / 2) * DAY_MS)
    const midCp = cyclePhase(input.lastPeriodStart, length, parseLocalDate(midIso)!)!
    const cyclesAhead = Math.max(1, Math.floor((s - startT) / (length * DAY_MS)))
    // Score: energía media, penalizando días de menos resto (SPM/menstruación).
    const score = avgEnergy - 0.12 * (lowDays / tripDays)

    windows.push({
      startIso, endIso: isoOf(s + (tripDays - 1) * DAY_MS), days: tripDays,
      avgEnergy, lowDays, midPhase: midCp.phase, midIsPms: midCp.isPmsWindow,
      score, uncertaintyDays: band * cyclesAhead, isWeekend,
    })
  }

  windows.sort((a, b) => b.score - a.score || (a.startIso < b.startIso ? -1 : 1))
  return typeof input.limit === 'number' ? windows.slice(0, input.limit) : windows
}
