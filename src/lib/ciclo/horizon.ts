// SIR V2 — Horizonte del ciclo (rediseño ficha · módulo protagonista). PURO.
//
// Cruza el ciclo (real hacia atrás + proyectado hacia adelante con incertidumbre)
// con EVENTOS de pareja/calendario, y da por cada evento su día del ciclo + fase
// + una LECTURA DE CUIDADO ("qué timing/gesto conviene"). NO diagnostica ni
// decide por la persona: ayuda a Aaron a elegir mejor momento y cuidado.
//
// LÍNEA ÉTICA (doc 17): timing y presencia, NUNCA presión ni descalificación.
// Data sensible. La predicción es orientativa (± días que crecen con la
// distancia y se recalibran con cada período confirmado), jamás anticonceptivo.

import { cyclePhase, type CyclePhaseId } from './phase'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

const DAY_MS = 86_400_000

export type HorizonEventKind = 'mesario' | 'birthday' | 'anniversary' | 'trip' | 'calendar' | 'partner'

export interface HorizonEventInput {
  /** Fecha del evento 'YYYY-MM-DD'. */
  date: string
  label: string
  kind: HorizonEventKind
}

export interface HorizonEvent extends HorizonEventInput {
  cycleDay: number
  phase: CyclePhaseId
  isPms: boolean
  isFertile: boolean
  /** true si el evento cae en el futuro respecto de `now`. */
  isFuture: boolean
  /** ± días de incertidumbre de la fase en esa fecha (0 si es pasado/real). */
  uncertainDays: number
  /** Lectura de cuidado (qué timing/gesto conviene). Registro de cuidado, no gestión. */
  reading: string
}

export interface CycleHorizon {
  events: HorizonEvent[]
  /** Inicios de período proyectados (ISO) dentro del horizonte, para las bandas. */
  projectedPeriods: string[]
  bandDays: number
}

/** Lectura de cuidado por fase. Presencia y timing, nunca presión. */
export function phaseCareReading(phase: CyclePhaseId, isPms: boolean, isFertile: boolean): string {
  if (isPms) return 'Semana más sensible. Cuidar energía y bajar exigencia; presencia simple, no conversación pesada.'
  if (phase === 'menstrual') return 'Días de recogimiento. Un plan suave e íntimo suma; sin sobrecargar.'
  if (isFertile || phase === 'ovulation') return 'Energía alta. Buen momento para un plan lindo juntos o proponer algo.'
  if (phase === 'follicular') return 'Energía en subida. Buen momento para planear o retomar temas con ganas.'
  return 'Un gesto simple de presencia va bien; mejor no volverlo agenda ni conversación pesada.'
}

function isoOf(t: number): string {
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export interface BuildCycleHorizonInput {
  /** Inicio del último período CONFIRMADO 'YYYY-MM-DD'. */
  lastPeriodStart: string
  cycleLengthDays: number
  /** ± días de irregularidad (de computeCycleRegularity). 0 = sin banda. */
  bandDays: number
  events: HorizonEventInput[]
  /** Ventana del horizonte 'YYYY-MM-DD'. */
  horizonFrom: string
  horizonTo: string
}

/**
 * Arma el horizonte: enriquece cada evento con su fase/día/lectura y proyecta los
 * inicios de período dentro de la ventana. PURO (`now` inyectable).
 */
export function buildCycleHorizon(input: BuildCycleHorizonInput, now: Date = new Date()): CycleHorizon | null {
  const start = parseLocalDate(input.lastPeriodStart)
  if (!start) return null
  const length = Math.max(15, Math.min(60, Math.round(input.cycleLengthDays || 28)))
  const band = Math.max(0, Math.round(input.bandDays || 0))
  const startT = Date.parse(`${input.lastPeriodStart}T00:00:00Z`)
  const fromT = Date.parse(`${input.horizonFrom}T00:00:00Z`)
  const toT = Date.parse(`${input.horizonTo}T00:00:00Z`)
  if (!Number.isFinite(startT) || !Number.isFinite(fromT) || !Number.isFinite(toT)) return null

  const nowT = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())

  // Períodos proyectados (inicios de ciclo) dentro del horizonte.
  const projectedPeriods: string[] = []
  for (let k = 0; ; k++) {
    const t = startT + k * length * DAY_MS
    if (t > toT) break
    if (t >= fromT) projectedPeriods.push(isoOf(t))
    if (k > 400) break // guardarraíl
  }

  // Enriquecer eventos que caen dentro del horizonte.
  const events: HorizonEvent[] = []
  for (const ev of input.events) {
    const evT = Date.parse(`${ev.date}T00:00:00Z`)
    if (!Number.isFinite(evT) || evT < fromT || evT > toT) continue
    const d = parseLocalDate(ev.date)
    if (!d) continue
    const cp = cyclePhase(input.lastPeriodStart, length, d)
    if (!cp) continue
    const isFuture = evT > nowT
    const cyclesAhead = Math.max(1, Math.floor((evT - startT) / (length * DAY_MS)))
    events.push({
      ...ev,
      cycleDay: cp.cycleDay,
      phase: cp.phase,
      isPms: cp.isPmsWindow,
      isFertile: cp.isFertileWindow,
      isFuture,
      uncertainDays: isFuture ? band * cyclesAhead : 0,
      reading: phaseCareReading(cp.phase, cp.isPmsWindow, cp.isFertileWindow),
    })
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  return { events, projectedPeriods, bandDays: band }
}
