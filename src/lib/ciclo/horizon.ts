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
import type { SpecialDate } from '@/types'

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
  /** % [0..100] sobre el rango del horizonte (para posicionar el pin/línea). */
  pct: number
}

export type BandPhase = CyclePhaseId | 'spm'

export interface HorizonBandSegment {
  phase: BandPhase
  /** % [0..100] sobre el rango del horizonte. */
  fromPct: number
  toPct: number
  /** ¿El segmento cae en el futuro (predicción, se dibuja tramado)? */
  isFuture: boolean
}

export interface HorizonMarker {
  pct: number
  label: string
  isFuture: boolean
}

export interface CycleHorizon {
  events: HorizonEvent[]
  /** Inicios de período proyectados (ISO) dentro del horizonte, para las bandas. */
  projectedPeriods: string[]
  bandDays: number
  /** Banda de fases del ciclo a lo ancho del rango (pasado real + futuro predicho). */
  band: HorizonBandSegment[]
  /** % de HOY sobre el rango. */
  todayPct: number
  /** Marcadores de inicio de período (d1) para la regla. */
  periodMarkers: HorizonMarker[]
  /** Marcadores de ovulación (~d14) para la regla. */
  ovulationMarkers: HorizonMarker[]
  /** Tono proyectado por día (perfil por fase): pico ~ovulación, valle SPM. */
  toneSeries: { pct: number; value: number; isFuture: boolean }[]
  /** Ventanas sugeridas para proponer planes (folicular→ovulación, más energía). */
  proposeWindows: { fromPct: number; toPct: number; isFuture: boolean }[]
}

/** Perfil de tono típico por día del ciclo (0..1). Tendencia poblacional, NO ley
 *  individual: bajo en período, sube en folicular, pico en ovulación, baja a SPM. */
export function toneProfile(cycleDay: number, length: number): number {
  const ovu = length - 14
  if (cycleDay <= 5) return 0.35
  if (cycleDay < ovu - 1) return 0.5 + 0.35 * ((cycleDay - 5) / Math.max(1, ovu - 1 - 5))
  if (cycleDay <= ovu + 1) return 0.95
  const afterOvu = cycleDay - (ovu + 1)
  const lutealLen = Math.max(1, length - (ovu + 1))
  return Math.max(0.35, 0.8 - 0.45 * (afterOvu / lutealLen))
}

/** Lectura de cuidado por fase. Presencia y timing, nunca presión. */
export function phaseCareReading(phase: CyclePhaseId, isPms: boolean, isFertile: boolean): string {
  if (isPms) return 'Semana más sensible. Cuidar energía y bajar exigencia; presencia simple, no conversación pesada.'
  if (phase === 'menstrual') return 'Días de recogimiento. Un plan suave e íntimo suma; sin sobrecargar.'
  if (isFertile || phase === 'ovulation') return 'Energía alta. Buen momento para un plan lindo juntos o proponer algo.'
  if (phase === 'follicular') return 'Energía en subida. Buen momento para planear o retomar temas con ganas.'
  return 'Un gesto simple de presencia va bien; mejor no volverlo agenda ni conversación pesada.'
}

/** Kinds que son un evento CON/DE la pareja → aplica la lectura de cuidado. */
function isPartnerKind(kind: HorizonEventKind): boolean {
  return kind === 'mesario' || kind === 'anniversary' || kind === 'birthday' || kind === 'partner'
}

/**
 * Lectura para un evento TUYO del calendario (compromiso/plan propio, ej. gym,
 * reunión, viaje): NO es un gesto hacia ella — sólo ubica el compromiso en la
 * fase, por si quieres coordinar cuidado o tiempo juntos alrededor. Neutral.
 */
function calendarPhaseReading(phase: CyclePhaseId, isPms: boolean): string {
  if (isPms) return 'Cae en su semana más sensible. Si puedes, dejá aire para un gesto simple; no sobrecargues esos días.'
  if (phase === 'menstrual') return 'Cae en sus días de recogimiento. Buen momento para un plan suave juntos si coordina.'
  if (phase === 'ovulation' || phase === 'follicular') return 'Cae en días de más energía — buen tramo para sumar algo lindo juntos si se puede.'
  return 'Ubica este compromiso en el ciclo para coordinar tiempo y cuidado; sin volverlo agenda.'
}

/** Elige la lectura según el tipo de evento: cuidado (pareja) vs neutral (propio). */
export function eventReading(kind: HorizonEventKind, phase: CyclePhaseId, isPms: boolean, isFertile: boolean): string {
  return isPartnerKind(kind) ? phaseCareReading(phase, isPms, isFertile) : calendarPhaseReading(phase, isPms)
}

function isoOf(t: number): string {
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function isoDate(y: number, m0: number, d: number): string {
  const dt = new Date(Date.UTC(y, m0, d))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/** Ocurrencia de una fecha recurrente (YYYY-MM-DD → MM-DD) dentro de [from,to], o null. */
function recurringInWindow(dateIso: string, fromIso: string, toIso: string): string | null {
  const mmdd = dateIso.slice(5)
  for (const year of [Number(fromIso.slice(0, 4)), Number(toIso.slice(0, 4))]) {
    const cand = `${year}-${mmdd}`
    if (cand >= fromIso && cand <= toIso) return cand
  }
  return null
}

function classifyLabel(label: string): HorizonEventKind {
  if (/anivers|mesario|feliz mes|meses de relaci/i.test(label)) return 'anniversary'
  if (/cumple|nacim/i.test(label)) return 'birthday'
  if (/viaje|cusco|trip|vuelo/i.test(label)) return 'trip'
  return 'calendar'
}

/**
 * Junta los eventos reales para el horizonte desde fechas importantes + cumple +
 * "mesarios" (día del mes del aniversario de pareja). PURO. Recurrentes se
 * proyectan a su ocurrencia en la ventana; los puntuales entran si caen dentro.
 */
export function gatherHorizonEvents(input: {
  specialDates: SpecialDate[]
  birthDate?: string | null
  personName: string
  fromIso: string
  toIso: string
  now: Date
}): HorizonEventInput[] {
  const { specialDates, birthDate, personName, fromIso, toIso, now } = input
  const events: HorizonEventInput[] = []
  const seen = new Set<string>()
  const add = (date: string, label: string, kind: HorizonEventKind) => {
    const key = `${date}|${label}`
    if (seen.has(key)) return
    seen.add(key)
    events.push({ date, label, kind })
  }

  for (const sd of specialDates) {
    if (!sd.date) continue
    const occ = sd.recurring
      ? recurringInWindow(sd.date, fromIso, toIso)
      : (sd.date >= fromIso && sd.date <= toIso ? sd.date : null)
    if (occ) add(occ, sd.label, classifyLabel(sd.label))
  }

  if (birthDate) {
    const occ = recurringInWindow(birthDate, fromIso, toIso)
    if (occ) add(occ, `Cumple de ${personName.split(' ')[0]}`, 'birthday')
  }

  // Mesarios: día del mes del aniversario de pareja (ej. el 13), por cada mes de
  // la ventana. Se deriva de una fecha importante de aniversario.
  const anni = specialDates.find((s) => /anivers|mesario|mes de relaci/i.test(s.label) && s.date)
  const anniDay = anni ? Number(anni.date.slice(8, 10)) : NaN
  if (Number.isFinite(anniDay) && anniDay >= 1 && anniDay <= 28) {
    for (let m = -1; m <= 3; m++) {
      const di = isoDate(now.getFullYear(), now.getMonth() + m, anniDay)
      if (di >= fromIso && di <= toIso) add(di, 'Mesario', 'mesario')
    }
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return events
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

  const span = Math.max(1, toT - fromT)
  const pctOf = (t: number) => Math.max(0, Math.min(100, ((t - fromT) / span) * 100))
  const todayPct = pctOf(nowT)

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
      reading: eventReading(ev.kind, cp.phase, cp.isPmsWindow, cp.isFertileWindow),
      pct: pctOf(evT),
    })
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  // Banda de fases: fase de CADA día del rango, agrupada en segmentos. Pasado
  // real vs futuro predicho (para el tramado). SPM = lútea tardía (isPmsWindow).
  const bandSegments: HorizonBandSegment[] = []
  const toneSeries: { pct: number; value: number; isFuture: boolean }[] = []
  const days = Math.round(span / DAY_MS)
  let cur: { phase: BandPhase; isFuture: boolean; start: number } | null = null
  for (let i = 0; i <= days; i++) {
    const dT = fromT + i * DAY_MS
    const dDate = parseLocalDate(isoOf(dT))
    if (!dDate) continue
    const cp = cyclePhase(input.lastPeriodStart, length, dDate)
    if (!cp) continue
    const phase: BandPhase = cp.isPmsWindow ? 'spm' : cp.phase
    const isFuture = dT > nowT
    toneSeries.push({ pct: pctOf(dT), value: toneProfile(cp.cycleDay, length), isFuture })
    if (!cur || cur.phase !== phase || cur.isFuture !== isFuture) {
      if (cur) bandSegments.push({ phase: cur.phase, isFuture: cur.isFuture, fromPct: pctOf(fromT + cur.start * DAY_MS), toPct: pctOf(dT) })
      cur = { phase, isFuture, start: i }
    }
  }
  if (cur) bandSegments.push({ phase: cur.phase, isFuture: cur.isFuture, fromPct: pctOf(fromT + cur.start * DAY_MS), toPct: 100 })

  // Ventanas para proponer: folicular→ovulación (energía en subida hasta el pico).
  const ovuDay = length - 14
  const proposeWindows = projectedPeriods.map((iso) => {
    const pStart = Date.parse(`${iso}T00:00:00Z`)
    const wFrom = pStart + 5 * DAY_MS            // fin del período
    const wTo = pStart + (ovuDay + 1) * DAY_MS   // hasta pasar la ovulación
    return { fromPct: pctOf(wFrom), toPct: pctOf(wTo), isFuture: wFrom > nowT }
  }).filter((w) => w.toPct > 0 && w.fromPct < 100)

  const periodMarkers: HorizonMarker[] = projectedPeriods.map((iso) => {
    const t = Date.parse(`${iso}T00:00:00Z`)
    return { pct: pctOf(t), label: iso.slice(5), isFuture: t > nowT }
  })
  const ovulationMarkers: HorizonMarker[] = projectedPeriods.map((iso) => {
    const t = Date.parse(`${iso}T00:00:00Z`) + (length - 14) * DAY_MS
    return { pct: pctOf(t), label: 'd14', isFuture: t > nowT }
  }).filter((m) => m.pct > 0 && m.pct < 100)

  return { events, projectedPeriods, bandDays: band, band: bandSegments, todayPct, periodMarkers, ovulationMarkers, toneSeries, proposeWindows }
}
