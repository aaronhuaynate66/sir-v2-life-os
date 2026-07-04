// SIR V2 — Ventana óptima para tareas de foco (11·M5). PURO.
//
// Cruza la curva de energía (M3) con el cronotipo (M2) para sugerir en qué franjas
// agendar trabajo profundo y en cuáles dejar tareas mecánicas / descanso. Solo
// emite si AMBOS insumos están por encima de su umbral; recomendación BLANDA
// ("probá foco 9–11"), revisable con más datos. No inventa.

import type { EnergyCurve } from './energyCurve'
import type { Chronotype } from './chronotype'

export interface FocusWindow {
  /** Horas de mayor energía (para trabajo profundo). */
  focusHours: number[]
  /** Horas de menor energía (mecánico / descanso). */
  restHours: number[]
  message: string | null
  sufficient: boolean
}

function fmtHours(hours: number[]): string {
  if (hours.length === 0) return ''
  if (hours.length === 1) return `${hours[0]}h`
  return `${hours[0]}–${hours[hours.length - 1]}h`
}

/**
 * Sugiere franjas de foco cruzando energía observada y cronotipo. PURO.
 */
export function computeFocusWindow(curve: EnergyCurve, chrono: Chronotype): FocusWindow {
  if (!curve.sufficient || !chrono.sufficient || curve.buckets.length === 0) {
    return { focusHours: [], restHours: [], message: null, sufficient: false }
  }

  const avgs = curve.buckets.map((b) => b.avg)
  const maxAvg = Math.max(...avgs)
  const minAvg = Math.min(...avgs)

  // Foco: horas dentro de 1.5 puntos del pico. Descanso: dentro de 1 del bajón.
  const focusHours = curve.buckets.filter((b) => b.avg >= maxAvg - 1.5).map((b) => b.hour).sort((a, b) => a - b)
  const restHours = curve.buckets.filter((b) => b.avg <= minAvg + 1).map((b) => b.hour).sort((a, b) => a - b)

  const chronoNote =
    chrono.position === 'búho'
      ? ' Como cronotipo búho, no te fuerces temprano: tu mejor foco llega más tarde.'
      : chrono.position === 'alondra'
        ? ' Como alondra, aprovechá la mañana antes de que caiga.'
        : ''

  const message =
    `Tu energía pega más alto alrededor de ${fmtHours(focusHours)} — buena franja para trabajo profundo. ` +
    `Dejá lo mecánico para el bajón (~${fmtHours(restHours)}).${chronoNote} (Blando, se afina con más datos.)`

  return { focusHours, restHours, message, sufficient: true }
}
