// SIR V2 — Fuerza de relación (15·8 backlog Clay #4). PURO.
//
// La "fuerza" = CERCANÍA ESTRUCTURAL (capa de Dunbar / categoría), no la salud
// reciente ni la importancia manual. Razón: un vínculo fuerte al que no le
// escribes hace un mes SIGUE siendo fuerte — eso es atención/salud (otro eje, ya
// cubierto por el termómetro/ventana de contacto), no fuerza. Y la categoría está
// seteada distinto por persona (íntimo/cercano/red/periférico), mientras que la
// importancia quedó en el default 5 para casi todos → no diferenciaba. Determinístico.

import type { PersonCategory } from '@/types'

export type RelationStrength = 'alta' | 'media' | 'baja'

/** Nivel de fuerza a partir de la capa de Dunbar (categoría). */
export function relationStrength(category: PersonCategory): RelationStrength {
  if (category === 'inner_circle' || category === 'close') return 'alta'
  if (category === 'network') return 'media'
  return 'baja' // peripheral / desconocido
}

export const STRENGTH_LABEL: Record<RelationStrength, string> = {
  alta: 'Fuerte',
  media: 'Media',
  baja: 'Débil',
}
