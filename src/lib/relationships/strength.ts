// SIR V2 — Fuerza de relación (15·8 backlog Clay #4). PURO.
//
// Bucketea la importancia (1-10, cómo pesa esa persona para vos) en un nivel
// legible de un vistazo: alta / media / baja. Sirve para el badge por contacto y
// para filtrar la lista de /relaciones. Determinístico, sin LLM.

export type RelationStrength = 'alta' | 'media' | 'baja'

/** Nivel de fuerza a partir de la importancia (1-10). */
export function relationStrength(importanceScore: number): RelationStrength {
  const s = Number.isFinite(importanceScore) ? importanceScore : 0
  if (s >= 7) return 'alta'
  if (s >= 4) return 'media'
  return 'baja'
}

export const STRENGTH_LABEL: Record<RelationStrength, string> = {
  alta: 'Fuerte',
  media: 'Media',
  baja: 'Débil',
}
