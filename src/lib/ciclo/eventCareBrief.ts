// SIR V2 — Briefing de cuidado por evento. PURO.
//
// Para un PLAN que viene con una persona (ej. "Matrimonio de Laura, 18-jul, voy
// con Diana"), cruza la fecha con el ciclo y devuelve: en qué fase/ánimo va a
// llegar ella, una lectura cálida de su estado probable, y SUGERENCIAS CONCRETAS
// de cuidado (un detalle, flores, un plan tranquilo, prepararte, intimidad como
// ternura). Anticipación para llegar preparado y cuidarla mejor.
//
// LÍNEA ÉTICA (doc 17, [[feedback-hold-ethical-guardrails]]): es CUIDADO, no
// gestión ni táctica. Tendencia, no certeza ni diagnóstico. NUNCA para "explicar"
// de antemano cómo va a estar ni para sacar ventaja. La intimidad se sugiere como
// cercanía y ternura según SU ritmo, jamás como algo a "conseguir".

import { cyclePhase, type CyclePhaseId } from './phase'
import { toneProfile } from './horizon'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

const DAY_MS = 86_400_000

export interface EventCareBrief {
  eventLabel: string
  eventDateIso: string
  daysUntilEvent: number
  phase: CyclePhaseId
  phaseLabel: string
  isPms: boolean
  isFertile: boolean
  cycleDay: number
  cycleLength: number
  /** Días hasta el próximo período de ELLA (proyectado) desde la fecha del evento. */
  daysUntilHerPeriod: number
  /** ± días de incertidumbre de la fase en esa fecha (crece con la distancia). */
  uncertaintyDays: number
  confidence: 'alta' | 'media' | 'baja'
  /** Energía típica 0..1 en el día del evento (para el gráfico). */
  energy: number
  /** Curva de energía por día del ciclo (1..length) para el sparkline. */
  energyCurve: number[]
  /** Encabezado corto legible. */
  headline: string
  /** Lectura cálida del estado probable de ella. */
  stateRead: string
  /** Sugerencias concretas de cuidado (2-5), en la voz de SIR. */
  suggestions: string[]
  /** Línea de honestidad (tendencia, no certeza). */
  caveat: string
}

export interface EventCareBriefInput {
  eventLabel: string
  eventDateIso: string
  /** Inicio del último período CONFIRMADO 'YYYY-MM-DD'. */
  lastPeriodStart: string
  cycleLengthDays: number
  /** ± días de irregularidad (de computeCycleRegularity). 0 = sin banda. */
  bandDays: number
  now?: Date
}

const PHASE_LABEL: Record<CyclePhaseId, string> = {
  menstrual: 'Menstrual', follicular: 'Folicular', ovulation: 'Ovulación', luteal: 'Lútea',
}

/** ¿El evento es una salida social larga (boda, fiesta, etc.)? Ajusta el consejo. */
function isBigSocialEvent(label: string): boolean {
  return /\bboda|matrimonio|casamiento|fiesta|graduaci[oó]n|cumplea[ñn]os|gala|cena de|evento\b/i.test(label)
}

/** Lectura del estado probable, cálida y honesta, por fase. */
function stateReadFor(phase: CyclePhaseId, isPms: boolean, isFertile: boolean): string {
  if (isPms) return 'Suele ser la ventana de menos resto: baja la energía, sube la sensibilidad y la batería social se acorta. Puede llegar más cansada o más a flor de piel — nada dramático, pero conviene llegar a cuidarla.'
  if (phase === 'menstrual') return 'Días de regla: energía baja y ganas de bajar el ritmo. Es más momento de acompañar que de "hacer".'
  if (isFertile || phase === 'ovulation') return 'Pico de energía y ánimo, más sociable y receptiva. Es su mejor momento para algo lindo juntos.'
  if (phase === 'follicular') return 'Energía y ánimo en subida, con ganas de hacer cosas. Buen tramo para planes y para reconectar.'
  return 'Post-ovulación: la energía empieza a bajar de a poco y se pone más hogareña. Ritmo tranquilo.'
}

/** Sugerencias de cuidado por fase (voz SIR). Afecto/flores/intimidad enmarcados
 *  como cercanía según SU ritmo — nunca como algo a conseguir. */
function suggestionsFor(phase: CyclePhaseId, isPms: boolean, isFertile: boolean, bigSocial: boolean): string[] {
  if (isPms || phase === 'menstrual') {
    const s = [
      'Un detalle que no le pida nada: flores, algo rico, un mensaje lindo antes — cuidado que no espera nada a cambio.',
      'Presencia y paciencia antes que exigencia: si está callada o baja, no es contra vos.',
      'Prevé lo práctico: puede venirle la regla por estos días — que esté cómoda suma; si suele tener migraña o cólicos, llevá su medicación.',
      'Intimidad como ternura, no como demanda: cercanía, mimos, contacto tranquilo; seguí su ritmo.',
    ]
    if (bigSocial) s.unshift('No sobrecargar el día: llegá sin apuro, con margen para descansar, y tené un plan de salida por si se cansa.')
    else s.unshift('Plan suave e íntimo mejor que una maratón: bajá el ritmo, algo tranquilo suma más que un día a full.')
    return s
  }
  if (isFertile || phase === 'ovulation') {
    return [
      'Es SU mejor momento: si tenías ganas de proponer algo especial —una cita, una sorpresa—, es ahora.',
      'Flores o un detalle romántico brillan más que nunca en estos días.',
      'Buen momento para una charla importante o para reconectar de verdad.',
      'Intimidad en su punto más alto de sintonía — con ganas y presencia.',
    ]
  }
  if (phase === 'follicular') {
    return [
      'Buen momento para PROPONER: planeá esa salida o actividad que venías queriendo.',
      'Energía en alza: retomar temas o proyectos juntos cae bien.',
      'Un detalle sorpresa o una cita linda funcionan muy bien ahora.',
      'Intimidad con buena sintonía — buen tramo para reconectar.',
    ]
  }
  return [
    'Planes más tranquilos y hogareños: la energía va bajando de a poco.',
    'Buen momento para una charla con calma (mejor no temas pesados).',
    'Un gesto de presencia —un detalle, cocinarle algo— suma.',
    'Cercanía sin sobre-exigir; cuidala si se cansa.',
  ]
}

function confidenceFor(bandDays: number, cyclesAhead: number): 'alta' | 'media' | 'baja' {
  const effective = bandDays * Math.max(1, cyclesAhead)
  if (effective <= 3) return 'alta'
  if (effective <= 7) return 'media'
  return 'baja'
}

/**
 * Arma el briefing de cuidado para un evento con la persona. PURO (`now` inyectable).
 * null si faltan datos o la fecha es inválida.
 */
export function buildEventCareBrief(input: EventCareBriefInput): EventCareBrief | null {
  const now = input.now ?? new Date()
  const evDate = parseLocalDate(input.eventDateIso)
  const start = parseLocalDate(input.lastPeriodStart)
  if (!evDate || !start) return null

  const cp = cyclePhase(input.lastPeriodStart, input.cycleLengthDays, evDate)
  if (!cp) return null

  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const evStart = new Date(evDate.getFullYear(), evDate.getMonth(), evDate.getDate())
  const daysUntilEvent = Math.round((evStart.getTime() - nowStart.getTime()) / DAY_MS)

  const length = cp.cycleLength
  const band = Math.max(0, Math.round(input.bandDays || 0))
  const cyclesAhead = Math.max(1, Math.floor((evStart.getTime() - start.getTime()) / (length * DAY_MS)))
  const uncertaintyDays = band * cyclesAhead

  const bigSocial = isBigSocialEvent(input.eventLabel)
  const energyCurve = Array.from({ length }, (_, i) => toneProfile(i + 1, length))

  const headline = `Fase ${PHASE_LABEL[cp.phase]}${cp.isPmsWindow ? ' (premenstrual · SPM)' : ''} · día ${cp.cycleDay}/${length} · su período ~${cp.daysUntilNextPeriod}d`

  const caveat = `Es una tendencia, no su estado real — la gente varía, y sobre una estimación de ±${uncertaintyDays || band}d (su último período confirmado no es reciente). Es para llegar preparado a cuidarla, no para explicar de antemano cómo va a estar. Se recalibra con su próximo período.`

  return {
    eventLabel: input.eventLabel,
    eventDateIso: input.eventDateIso.slice(0, 10),
    daysUntilEvent,
    phase: cp.phase,
    phaseLabel: PHASE_LABEL[cp.phase],
    isPms: cp.isPmsWindow,
    isFertile: cp.isFertileWindow,
    cycleDay: cp.cycleDay,
    cycleLength: length,
    daysUntilHerPeriod: cp.daysUntilNextPeriod,
    uncertaintyDays,
    confidence: confidenceFor(band, cyclesAhead),
    energy: toneProfile(cp.cycleDay, length),
    energyCurve,
    headline,
    stateRead: stateReadFor(cp.phase, cp.isPmsWindow, cp.isFertileWindow),
    suggestions: suggestionsFor(cp.phase, cp.isPmsWindow, cp.isFertileWindow, bigSocial),
    caveat,
  }
}
