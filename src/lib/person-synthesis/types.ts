// SIR V2 — Tipos de person_synthesis (migration 0010).
//
// Cache de la síntesis narrativa "Lo personal" (#8 del detail page). Cada
// generación LLM se guarda como un row; el más reciente lleva is_current=true
// y los anteriores quedan archivados (is_current=false) para historial.
//
// El texto se guarda como prosa plana con párrafos separados por línea en
// blanco (\n\n). La UI lo parte por /\n{2,}/ para renderizar 3 párrafos.

export interface PersonSynthesis {
  id: string
  personId: string
  /** Prosa narrativa (≈3 párrafos, separados por \n\n). */
  synthesisText: string
  /** Cuántas observations alimentaron esta síntesis. */
  sourceObservationCount: number
  /** Ids de las observations fuente (trazabilidad). */
  sourceObservationIds: string[]
  modelUsed: string
  inputTokens: number | null
  outputTokens: number | null
  generatedAt: string
  isCurrent: boolean
  generatedReason: string | null
}

export interface PersonSynthesisError {
  error: string
  detail?: string
}
