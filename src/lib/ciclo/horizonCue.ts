// SIR V2 — Síntesis del Horizonte del ciclo (lógica pura).
//
// Mapea la fase actual (cyclePhase) a una lectura corta de CUIDADO: cuándo es
// buen momento para proponer y cuándo conviene bajar la intensidad. Vive acá
// (no en el componente) para poder testearse sin arrastrar JSX y para respetar
// la convención de SIR: la lógica es pura y determinística.
//
// LÍNEA ÉTICA (doc 17): timing y presencia, NUNCA presión ni descalificación.

import type { CyclePhase } from './phase'

export type HorizonCueTone = 'good' | 'care' | 'neutral'

export interface HorizonCue {
  text: string
  tone: HorizonCueTone
}

/** Síntesis corta (mejor momento / cuidado hoy) según la fase actual. */
export function synthesisCue(cp: CyclePhase): HorizonCue {
  if (cp.isFertileWindow || cp.phase === 'follicular' || cp.phase === 'ovulation') {
    return { text: 'Buen momento para proponer planes: más energía y apertura.', tone: 'good' }
  }
  if (cp.isPmsWindow || cp.phase === 'menstrual') {
    return { text: 'Hoy: presencia y cuidado — sin presión ni temas pesados.', tone: 'care' }
  }
  return { text: 'Vínculo en fase estable — seguí con lo de siempre.', tone: 'neutral' }
}
