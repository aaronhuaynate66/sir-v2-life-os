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

/** Tipo de vínculo → define el REGISTRO del consejo (ético, doc 17):
 *  partner = cuidado/intimidad; family/friend = presencia y paciencia;
 *  colleague = respeto y timing profesional (NUNCA gestos íntimos ni "sacar algo"). */
export type CareBond = 'partner' | 'family' | 'colleague' | 'friend'

export interface EventCareBriefInput {
  eventLabel: string
  eventDateIso: string
  /** Inicio del último período CONFIRMADO 'YYYY-MM-DD'. */
  lastPeriodStart: string
  cycleLengthDays: number
  /** ± días de irregularidad (de computeCycleRegularity). 0 = sin banda. */
  bandDays: number
  /** Registro del consejo según el vínculo. Default 'partner'. */
  bond?: CareBond
  now?: Date
}

const PHASE_LABEL: Record<CyclePhaseId, string> = {
  menstrual: 'Menstrual', follicular: 'Folicular', ovulation: 'Ovulación', luteal: 'Lútea',
}

/** ¿El evento es una salida social larga (boda, fiesta, etc.)? Ajusta el consejo. */
function isBigSocialEvent(label: string): boolean {
  return /\bboda|matrimonio|casamiento|fiesta|graduaci[oó]n|cumplea[ñn]os|gala|cena de|evento\b/i.test(label)
}

const isLow = (phase: CyclePhaseId, isPms: boolean) => isPms || phase === 'menstrual'
const isHigh = (phase: CyclePhaseId, isFertile: boolean) => isFertile || phase === 'ovulation' || phase === 'follicular'

/** Lectura del estado probable — base factual (neutral) + cierre según el vínculo. */
function stateReadFor(phase: CyclePhaseId, isPms: boolean, isFertile: boolean, bond: CareBond): string {
  const base = isPms
    ? 'Suele ser la ventana de menos resto: baja la energía, sube la sensibilidad y la batería social se acorta. Puede llegar más cansada o más a flor de piel.'
    : phase === 'menstrual' ? 'Días de regla: energía típicamente más baja y ganas de bajar el ritmo.'
      : (isFertile || phase === 'ovulation') ? 'Pico de energía y ánimo, más sociable.'
        : phase === 'follicular' ? 'Energía y ánimo en subida, con ganas de hacer cosas.'
          : 'Post-ovulación: la energía empieza a bajar de a poco.'
  const low = isLow(phase, isPms)
  const closing: Record<CareBond, string> = {
    partner: low ? ' Nada dramático, pero conviene llegar a cuidarla.' : ' Buen tramo para estar cerca.',
    family: low ? ' Un poco más de paciencia y presencia simple ayuda.' : ' Buen momento para una charla o un plan.',
    friend: low ? ' Un gesto simple suma; no la satures.' : ' Buen momento para juntarse.',
    colleague: low ? ' Si puedes, tratá esos días con más aire y menos exigencia.' : ' Buen tramo para lo que requiera empuje.',
  }
  return base + closing[bond]
}

/** Sugerencias por fase Y por vínculo. Con pareja: cuidado/intimidad. Con familia/
 *  amiga: presencia y paciencia. Con colega: respeto y timing — SIN gestos íntimos,
 *  flores ni nada para "conseguir". Ético (doc 17). */
function suggestionsFor(phase: CyclePhaseId, isPms: boolean, isFertile: boolean, bigSocial: boolean, bond: CareBond): string[] {
  const low = isLow(phase, isPms), high = isHigh(phase, isFertile)
  if (bond === 'partner') {
    if (low) {
      const s = [
        'Un detalle que no le pida nada: flores, algo rico, un mensaje lindo antes — cuidado que no espera nada a cambio.',
        'Presencia y paciencia antes que exigencia: si está callada o baja, no es contra ti.',
        'Prevé lo práctico: puede venirle la regla por estos días — que esté cómoda suma; si suele tener migraña o cólicos, lleva su medicación.',
        'Intimidad como ternura, no como demanda: cercanía, mimos, contacto tranquilo; sigue su ritmo.',
      ]
      s.unshift(bigSocial ? 'No sobrecargar el día: llega sin apuro, con margen para descansar, y ten un plan de salida por si se cansa.' : 'Plan suave e íntimo mejor que una maratón: baja el ritmo.')
      return s
    }
    if (high) return ['Es SU mejor momento: si querías proponer algo especial —una cita, una sorpresa—, es ahora.', 'Flores o un detalle romántico brillan más que nunca.', 'Buen momento para una charla importante o para reconectar.', 'Intimidad en su punto más alto de sintonía.']
    return ['Planes más tranquilos y hogareños.', 'Buen momento para una charla con calma.', 'Un gesto de presencia suma.', 'Cercanía sin sobre-exigir.']
  }
  if (bond === 'family' || bond === 'friend') {
    const who = bond === 'family' ? 'familiar' : 'amiga'
    if (low) return [`Puede estar más sensible o con menos energía — más paciencia y un gesto simple; no cargues temas pesados esos días.`, 'Si venía algo tenso, no es el mejor momento para encararlo — déjalo pasar unos días.', `Un mensaje cálido o un pequeño detalle acompaña sin invadir.`, `Presencia, no exigencia (${who}).`]
    if (high) return ['Buen tramo de energía — buen momento para juntarse, retomar algo pendiente o una charla que venías postergando.', 'Si había un tema para hablar, ahora fluye mejor.']
    return ['Ritmo tranquilo — un gesto de presencia simple está bien.', 'Buen momento para una charla con calma.']
  }
  // colleague / lead — SOLO respeto y timing profesional. Nada íntimo.
  if (low) return ['Puede llegar con menos resto — si puedes, evita reuniones pesadas, feedback difícil o pedirle un esfuerzo extra ese día.', 'Dale aire: más margen, menos presión; no lo tomes personal si está más seca.', 'Timing: deja los temas espinosos para unos días después.']
  if (high) return ['Buen tramo de energía — buen momento para lo que requiera empuje, una reunión importante o cerrar algo.', 'Suele estar más receptiva y comunicativa; aprovecha para alinear.']
  return ['Ritmo normal — sin necesidad de ajustar nada especial.', 'Trato considerado de siempre.']
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

  const bond: CareBond = input.bond ?? 'partner'
  const bigSocial = isBigSocialEvent(input.eventLabel)
  const energyCurve = Array.from({ length }, (_, i) => toneProfile(i + 1, length))

  const headline = `Fase ${PHASE_LABEL[cp.phase]}${cp.isPmsWindow ? ' (premenstrual · SPM)' : ''} · día ${cp.cycleDay}/${length} · su período ~${cp.daysUntilNextPeriod}d`

  const purpose = bond === 'colleague'
    ? 'Es para tratarla con más consideración y elegir el timing, no para gestionar ni sacar ventaja'
    : bond === 'partner' ? 'Es para llegar preparado a cuidarla, no para explicar de antemano cómo va a estar'
      : 'Es para acompañarla con más consideración, no para explicar de antemano cómo va a estar'
  const caveat = `Es una tendencia, no su estado real — la gente varía, sobre una estimación de ±${uncertaintyDays || band}d. ${purpose}. Coincidencia, no causa; nunca una explicación de lo que siente. Se recalibra con cada período que registres.`

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
    stateRead: stateReadFor(cp.phase, cp.isPmsWindow, cp.isFertileWindow, bond),
    suggestions: suggestionsFor(cp.phase, cp.isPmsWindow, cp.isFertileWindow, bigSocial, bond),
    caveat,
  }
}
