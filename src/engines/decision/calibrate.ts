// SIR V2 — Calibrador de esfuerzo por reversibilidad (14·M3) + modo maximizar /
// satisficer (14·M4). PURO.
//
// El gate de reversibilidad ya existe en evaluateDecision, pero solo mueve el
// veredicto. Esto lo convierte en REGULADOR DE UX (Bezos): una puerta de dos vías
// no se sobre-piensa (decidí y ajusta); una de una vía justifica cuidado. Y elige
// el modo (Simon/Schwartz): maximiza lo irreversible-de-alto-sentido, satisficea
// el resto — contra la parálisis.
//
// También expone dos flags que consumen otros módulos: premortemRecommended
// (14·M2) y valuesTension (14·M6).

import type { DecisionAssessment, DecisionDimension } from './index'

export type DoorType = 'two_way' | 'one_way' | 'unclear'
export type DecisionMode = 'maximize' | 'satisfice'

export interface DecisionCalibration {
  doorType: DoorType
  /** Guía de CUÁNTO esfuerzo merece (14·M3). */
  effortGuidance: string
  mode: DecisionMode
  /** Guía del modo (14·M4). */
  modeGuidance: string
  /** true si la dimensión valores salió en contra (14·M6 — nombrar la tensión). */
  valuesTension: boolean
  /** true si conviene forzar un premortem antes del veredicto (14·M2). */
  premortemRecommended: boolean
}

function scoreOf(a: DecisionAssessment, dim: DecisionDimension): number | null {
  const d = a.dimensions.find((x) => x.dimension === dim)
  return d && d.evaluated ? d.score : null
}

/**
 * Calibra el esfuerzo y el modo a partir del assessment ya computado. PURO.
 */
export function calibrateDecision(a: DecisionAssessment): DecisionCalibration {
  const rev = scoreOf(a, 'reversibility')
  const values = scoreOf(a, 'values')

  const doorType: DoorType = rev === null ? 'unclear' : rev >= 1 ? 'two_way' : rev <= -1 ? 'one_way' : 'unclear'

  const effortGuidance =
    doorType === 'two_way'
      ? 'Puerta de dos vías: equivocarte acá es barato porque vuelves. No la sobre-pienses — decidí rápido y ajusta.'
      : doorType === 'one_way'
        ? 'Puerta de una vía: cara de revertir. Acá sí vale tomarte el tiempo, mirar más dimensiones y pensar el peor caso.'
        : 'Reversibilidad poco clara: si puedes volver atrás sin gran costo, trátala como reversible y decidí; si no, anda con cuidado.'

  // Alto sentido = valores en juego con fuerza (magnitud), no solo signo.
  const highSense = values !== null && Math.abs(values) >= 1
  const highStakes = doorType === 'one_way' && highSense
  const mode: DecisionMode = highStakes ? 'maximize' : 'satisfice'

  const modeGuidance = highStakes
    ? 'Vale MAXIMIZAR: es irreversible y toca algo que te importa. Tomate el tiempo de buscar la mejor opción, no la primera.'
    : 'SATISFICÉ: busca una opción suficientemente buena y seguí. Maximizar acá te cuesta paz, no resultado (paradoja de la elección).'

  const valuesTension = values !== null && values < 0

  const premortemRecommended =
    doorType === 'one_way' || a.verdict === 'caution' || a.verdict === 'hold'

  return { doorType, effortGuidance, mode, modeGuidance, valuesTension, premortemRecommended }
}
