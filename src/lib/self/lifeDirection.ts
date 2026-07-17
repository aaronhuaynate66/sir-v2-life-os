// SIR V2 — "Tu rumbo": el hilo de dirección de vida (E5, Life Direction System).
//
// ENSAMBLADOR puro: no reimplementa nada. Toma las salidas de los motores que ya
// existen —trajectoryArc, lifeSeasons, lifeThread, coherence, year-compass— y las
// hilvana en un único hilo de tres tramos: PASADO (de dónde venís, capítulos
// cerrados), PRESENTE (en qué capítulo estás + si tu foco acompaña lo declarado),
// y FUTURO (el norte + una proyección honesta de si vas encaminado).
//
// La pieza NUEVA es la proyección de futuro (`outlook`): hoy el "hacia dónde vas"
// es solo el norte declarado a mano. Acá se DERIVA de señales reales (patrón de
// trayectoria, momentum, coherencia) un veredicto honesto y anti-culpa —jamás un
// diagnóstico ni una culpa, solo "el norte está en tu línea" / "pide reenganche".
//
// PURO y determinístico: recibe objetos ya computados + `now` inyectable; sin red,
// sin stores, sin reloj propio. Estados `insufficient` explícitos cuando falta
// recorrido — nunca inventa un rumbo que no se puede leer.

import type { TrajectoryArc, TrajectoryPattern, TrajectoryMomentum } from './trajectoryArc'
import type { LifeSeasons } from './lifeSeasons'
import type { LifeMilestone } from './lifeThread'
import type { LifeCoherence, CoherenceState, CoherenceTrend } from './coherence'
import type { YearCompass } from '../year-compass/build'

/** Tramo PASADO: de dónde venís. */
export interface LifeDirectionPast {
  /** Capítulos (estaciones) ya cerrados —los que no son el actual. */
  closedSeasons: number
  /** Rótulo del capítulo inmediatamente anterior al actual, o null. */
  previousSeasonLabel: string | null
  /** ISO date-only del primer hito del hilo (el arranque), o null. */
  firstMilestoneDate: string | null
  /** Cuántos hitos fechados componen el hilo hasta hoy. */
  milestoneCount: number
}

/** Tramo PRESENTE: en qué capítulo estás y si tu foco lo acompaña. */
export interface LifeDirectionPresent {
  /** Rótulo del capítulo en curso, o null si venís en una pausa entre capítulos. */
  currentSeasonLabel: string | null
  currentSeasonSummary: string | null
  coherenceState: CoherenceState
  coherenceTrend: CoherenceTrend
  pattern: TrajectoryPattern
  momentum: TrajectoryMomentum
}

/** Veredicto honesto de "hacia dónde vas" respecto del norte. */
export type DirectionOutlook =
  | 'on_track' // patrón + foco acompañan el norte
  | 'at_risk' // hay señal de que el norte se aleja (soltás más, foco fuera, desacelera)
  | 'steady_no_anchor' // vas sostenido pero no hay un norte declarado que enmarque
  | 'insufficient' // falta recorrido/datos para proyectar sin inventar

/** Tramo FUTURO: el norte + la proyección derivada. */
export interface LifeDirectionFuture {
  anchorTitle: string | null
  anchorSubtitle: string | null
  /** Días hasta el norte (negativo si ya pasó); null si el norte no tiene fecha. */
  daysUntil: number | null
  outlook: DirectionOutlook
  /** Racional honesto y anti-culpa de por qué ese outlook. */
  rationale: string
}

export interface LifeDirection {
  /** ¿Hay recorrido suficiente para leer un hilo? (como hasArc en los paneles). */
  hasThread: boolean
  past: LifeDirectionPast
  present: LifeDirectionPresent
  future: LifeDirectionFuture
  /** Una línea que hilvana pasado → presente → futuro. */
  message: string
}

export interface LifeDirectionInput {
  arc: TrajectoryArc
  seasons: LifeSeasons
  thread: LifeMilestone[]
  coherence: LifeCoherence
  compass: YearCompass
}

/** Mínimo de objetivos resueltos para arriesgar una proyección de futuro. */
const MIN_RESOLVED_FOR_OUTLOOK = 2

/** Señales que empujan a "el norte se aleja". Anti-culpa: son descripciones. */
function riskSignals(arc: TrajectoryArc, coherence: LifeCoherence): number {
  let n = 0
  if (arc.pattern === 'releasing') n++
  if (arc.momentum === 'desacelera') n++
  if (coherence.state === 'diverging') n++
  if (coherence.trend === 'alejandose') n++
  return n
}

/** Señales que empujan a "el norte está en tu línea". */
function goodSignals(arc: TrajectoryArc, coherence: LifeCoherence): number {
  let n = 0
  if (arc.pattern === 'building' || arc.pattern === 'steady') n++
  if (arc.momentum === 'acelera') n++
  if (coherence.state === 'coherent') n++
  if (coherence.trend === 'convergiendo') n++
  return n
}

function deriveOutlook(
  arc: TrajectoryArc,
  coherence: LifeCoherence,
  hasAnchor: boolean,
): { outlook: DirectionOutlook; rationale: string } {
  // Sin recorrido resuelto no proyectamos: sería inventar.
  if (arc.resolved < MIN_RESOLVED_FOR_OUTLOOK) {
    return {
      outlook: 'insufficient',
      rationale:
        'Todavía hay poco recorrido cerrado para leer hacia dónde vas. Se afina a medida que cierras o sueltas objetivos —sin apuro.',
    }
  }

  const risk = riskSignals(arc, coherence)
  const good = goodSignals(arc, coherence)

  if (!hasAnchor) {
    // Sin norte declarado no hay contra qué proyectar; reflejamos el sostén.
    if (good > risk) {
      return {
        outlook: 'steady_no_anchor',
        rationale:
          'Vienes sostenido, pero no hay un norte declarado que le dé marco. Elegir un ancla haría que este hilo apunte a algo.',
      }
    }
    return {
      outlook: 'insufficient',
      rationale:
        'Sin un norte declarado y con señales mezcladas, no hay una dirección clara que leer. Un ancla ordenaría el rumbo.',
    }
  }

  if (risk > good) {
    return {
      outlook: 'at_risk',
      rationale: riskRationale(arc, coherence),
    }
  }
  if (good > 0) {
    return {
      outlook: 'on_track',
      rationale: goodRationale(arc, coherence),
    }
  }
  return {
    outlook: 'insufficient',
    rationale:
      'Las señales de tu trayectoria y tu foco no alcanzan para proyectar el norte con honestidad todavía.',
  }
}

function riskRationale(arc: TrajectoryArc, coherence: LifeCoherence): string {
  const bits: string[] = []
  if (arc.pattern === 'releasing') bits.push('últimamente sueltas más de lo que cierras')
  if (arc.momentum === 'desacelera') bits.push('el ritmo con que cierras viene bajando')
  if (coherence.state === 'diverging') bits.push('el grueso de tu foco cae fuera de lo declarado')
  if (coherence.trend === 'alejandose') bits.push('tu foco viene alejándose de lo declarado')
  const head = bits.length ? bits.slice(0, 2).join(' y ') : 'las señales recientes no acompañan'
  // Primera letra en mayúscula, sin culpa: "pide reenganche".
  const s = head.charAt(0).toUpperCase() + head.slice(1)
  return `${s}. El norte no se perdió: pide reenganche, sin drama.`
}

function goodRationale(arc: TrajectoryArc, coherence: LifeCoherence): string {
  const bits: string[] = []
  if (arc.pattern === 'building') bits.push('cierras más de lo que sueltas')
  else if (arc.pattern === 'steady') bits.push('sostienes un equilibrio entre lo que cierras y lo que sueltas')
  if (arc.momentum === 'acelera') bits.push('tu ritmo viene subiendo')
  if (coherence.state === 'coherent') bits.push('tu foco reciente cae en lo declarado')
  if (coherence.trend === 'convergiendo') bits.push('tu foco viene acercándose a lo declarado')
  const head = bits.length ? bits.slice(0, 2).join(' y ') : 'tus señales recientes acompañan'
  const s = head.charAt(0).toUpperCase() + head.slice(1)
  return `${s}. El norte está en tu línea.`
}

/** Hilo de una línea pasado → presente → futuro (para el header/síntesis local). */
function buildMessage(
  past: LifeDirectionPast,
  present: LifeDirectionPresent,
  future: LifeDirectionFuture,
): string {
  // Tramo pasado→presente sin redundancia: si no hay capítulo anterior, el actual
  // ES el primero (no repetir "primer capítulo" y "estás en X").
  let here: string
  if (present.currentSeasonLabel) {
    here = past.previousSeasonLabel
      ? `Vienes de “${past.previousSeasonLabel}”, hoy estás en “${present.currentSeasonLabel}”`
      : `Estás en tu primer capítulo, “${present.currentSeasonLabel}”`
  } else {
    here = past.previousSeasonLabel
      ? `Vienes de “${past.previousSeasonLabel}”, hoy transitas una pausa entre capítulos`
      : 'Estás arrancando tu rumbo'
  }
  let to: string
  switch (future.outlook) {
    case 'on_track':
      to = future.anchorTitle ? `y el norte “${future.anchorTitle}” está en tu línea` : 'y vas encaminado'
      break
    case 'at_risk':
      to = future.anchorTitle ? `y el norte “${future.anchorTitle}” pide reenganche` : 'y el rumbo pide reenganche'
      break
    case 'steady_no_anchor':
      to = 'y te falta elegir el norte que le dé marco'
      break
    default:
      to = 'y el rumbo se afina con más recorrido'
  }
  return `${here}, ${to}.`
}

/**
 * Ensambla el hilo de dirección de vida a partir de las salidas de los motores
 * existentes. PURO. `hasThread` es false cuando no hay ni arco ni capítulos que
 * leer (equivale al empty state de los paneles E5).
 */
export function buildLifeDirection(input: LifeDirectionInput): LifeDirection {
  const { arc, seasons, thread, coherence, compass } = input

  const hasThread = arc.total > 0 || seasons.seasons.length > 0

  const current = seasons.current
  const closed = seasons.seasons.filter((s) => !s.isCurrent)
  // El capítulo anterior al actual = el más reciente de los cerrados.
  const previousSeasonLabel = closed.length > 0 ? closed[0].label : null

  const sortedThread = [...thread].sort((a, b) => a.date.localeCompare(b.date))
  const firstMilestoneDate = sortedThread.length > 0 ? sortedThread[0].date : null

  const past: LifeDirectionPast = {
    closedSeasons: closed.length,
    previousSeasonLabel,
    firstMilestoneDate,
    milestoneCount: thread.length,
  }

  const present: LifeDirectionPresent = {
    currentSeasonLabel: current?.label ?? null,
    currentSeasonSummary: current?.summary ?? null,
    coherenceState: coherence.state,
    coherenceTrend: coherence.trend,
    pattern: arc.pattern,
    momentum: arc.momentum,
  }

  const anchor = compass.anchor
  const { outlook, rationale } = deriveOutlook(arc, coherence, !!anchor)

  const future: LifeDirectionFuture = {
    anchorTitle: anchor?.title ?? null,
    anchorSubtitle: anchor?.subtitle ?? null,
    daysUntil: anchor?.daysUntil ?? null,
    outlook,
    rationale,
  }

  return {
    hasThread,
    past,
    present,
    future,
    message: buildMessage(past, present, future),
  }
}
