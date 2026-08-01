// SIR V2 — Próximo paso mínimo + tamaño por energía (12·M2 + 12·M3). PURO.
//
// Fogg (B=MAP): la conducta ocurre cuando Motivación, Habilidad y Prompt
// coinciden. Bajar la FRICCIÓN (Ability) sube la probabilidad. M2: mostrar EL
// siguiente paso más chico y pre-decidido, no la lista; si es grande, ofrecer un
// arranque de 10-15 min. M3: cruzar con la energía del día — energía baja →
// versión mínima ("hábito mínimo viable"), preservar el ritmo sin exigir el L.
// Nunca proponer el L con energía baja. SDT: la competencia se cuida no exigiendo
// de más. Honesto: sin métrica de energía del día, no la usa (solo M2).

import type { TaskEffort } from '@/types'

/** Umbral de energía baja (self_metrics energy 1-10). */
const LOW_ENERGY = 4

export interface NextStepInput {
  title: string
  effort?: TaskEffort
  /** Energía del día (self_metrics 'energy', 1-10), o null si no hay registro hoy. */
  todayEnergy?: number | null
}

export interface NextStepGuidance {
  /** Acción sugerida — el arranque mínimo, pre-decidido. */
  suggestion: string
  /** true si se propuso achicar el paso. */
  downsized: boolean
  reason: 'low_energy' | 'big_effort' | null
}

/**
 * Dimensiona el próximo paso: lo achica si la energía está baja o el esfuerzo es
 * grande, para bajar la fricción de arrancar. PURO.
 */
export function sizeNextStep(input: NextStepInput): NextStepGuidance {
  const { title, effort } = input
  const energy = input.todayEnergy
  const lowEnergy = typeof energy === 'number' && Number.isFinite(energy) && energy <= LOW_ENERGY
  const t = `"${title.trim()}"`

  if (lowEnergy && (effort === 'L' || effort === 'M')) {
    return {
      suggestion: `Hoy tu energía está baja: no vayas por todo. Arranca con 10 min de ${t} — mantener el ritmo vale más que el tamaño.`,
      downsized: true,
      reason: 'low_energy',
    }
  }
  if (effort === 'L') {
    return {
      suggestion: `Es un paso grande. Partilo: un primer bloque de 10-15 min de ${t} y listo por hoy.`,
      downsized: true,
      reason: 'big_effort',
    }
  }
  return {
    suggestion: `Tu próximo paso: ${t}. Es abarcable — hazlo y tachalo.`,
    downsized: false,
    reason: null,
  }
}
