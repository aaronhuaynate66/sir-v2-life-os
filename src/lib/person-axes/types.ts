// SIR V2 — Tipos de person_profile_axes (migration 0047).
//
// Los DOS ejes narrativos que v2 persiste fuera de person_synthesis:
// PROFESIONAL y SOCIAL. El eje PERSONAL vive en person_synthesis (síntesis IA
// cacheada, #8 "Lo personal"). Juntos forman los 3 ejes persistidos de la ficha.
//
// Texto determinístico (sin LLM), generado en el momento de la captura. El
// `source` permite que un futuro editor inline ('manual') no sea pisado por la
// recomputación automática ('auto') al recapturar.

export type AxisSource = 'auto' | 'manual'

export interface PersonProfileAxes {
  personId: string
  /** Eje profesional sintetizado (LinkedIn + educación). null si nunca se generó. */
  professionalText: string | null
  professionalSource: AxisSource
  professionalObservationIds: string[]
  professionalGeneratedAt: string | null
  /** Eje social sintetizado (Instagram + seguidores en común). null si no se generó. */
  socialText: string | null
  socialSource: AxisSource
  socialObservationIds: string[]
  socialGeneratedAt: string | null
}
