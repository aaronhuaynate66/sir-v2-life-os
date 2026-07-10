// SIR V2 — Sugerencia de planificación desde el cronotipo (11·M5 → /horario). PURO.
//
// El doc 11 dice que la ventana de foco (M5) debe "alimentar al planificador de
// horario". Este módulo toma la salida de computeFocusWindow + computeChronotype y
// arma una línea CORTA, orientada a agendar el día: "agendá foco 9–11h; dejá lo
// mecánico para el bajón". Puro formateo, sin lógica de inferencia nueva.
//
// Diferencia honesta con la card de /salud: `formatHourRanges` agrupa horas
// CONTIGUAS en rangos reales ("9–11h y 14–15h"), en vez del "primera–última" que
// miente cuando las horas con datos no son contiguas (p. ej. 9,10,14,15 no es
// "9–15h"). Preferimos huecos honestos a un rango inflado.

import type { FocusWindow } from './focusWindow'
import type { Chronotype } from './chronotype'

export interface PlanningHint {
  /** Franjas de foco ya formateadas ("9–11h"), o null si no alcanza. */
  focusLabel: string | null
  /** Franjas de bajón ("14–15h"), o null. */
  restLabel: string | null
  /** Línea lista para mostrar en /horario, o null. */
  headline: string | null
  sufficient: boolean
}

/**
 * Agrupa horas (0-23) en rangos CONTIGUOS legibles.
 * [9,10,11] → "9–11h"; [9,10,14] → "9–10h y 14h"; [] → ''. PURO.
 */
export function formatHourRanges(hours: number[]): string {
  const sorted = [...new Set(hours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort((a, b) => a - b)
  if (sorted.length === 0) return ''

  const runs: Array<[number, number]> = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i]
      continue
    }
    runs.push([start, prev])
    start = sorted[i]
    prev = sorted[i]
  }
  runs.push([start, prev])

  const parts = runs.map(([a, b]) => (a === b ? `${a}h` : `${a}–${b}h`))
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

/**
 * Convierte la ventana de foco (M5) + el cronotipo (M2) en una sugerencia corta
 * para el planificador de /horario. Solo emite si la ventana es suficiente. PURO.
 */
export function buildPlanningHint(focus: FocusWindow, chrono: Chronotype): PlanningHint {
  if (!focus.sufficient || focus.focusHours.length === 0) {
    return { focusLabel: null, restLabel: null, headline: null, sufficient: false }
  }

  const focusLabel = formatHourRanges(focus.focusHours)
  const restLabel = focus.restHours.length ? formatHourRanges(focus.restHours) : null

  const chronoNote =
    chrono.position === 'búho'
      ? ' Sos búho: no fuerces lo pesado temprano.'
      : chrono.position === 'alondra'
        ? ' Sos alondra: la mañana es tu mejor carta.'
        : ''

  const restPart = restLabel ? ` Lo mecánico, mejor en el bajón (~${restLabel}).` : ''
  const headline = `Agendá tu trabajo profundo cerca de ${focusLabel}.${restPart}${chronoNote}`.trim()

  return { focusLabel, restLabel, headline, sufficient: true }
}
