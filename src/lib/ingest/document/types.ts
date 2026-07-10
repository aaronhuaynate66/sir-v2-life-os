// SIR V2 — Ingestión documental: tipos compartidos (cliente + servidor).
//
// Un documento (PDF de informe/artículo/journal, o texto pegado) se convierte
// en una síntesis estructurada + una lista de MEMORIAS discretas, que el usuario
// revisa/edita ANTES de guardar. Nunca guardado ciego (docs/08_UX_SYSTEM.md #7).
//
// A diferencia de /api/capture/document (extracción PUNTUAL de un documento de
// identidad, que NUNCA se materializa), acá el documento SÍ alimenta memorias:
// es material informativo (un paper, un informe, una nota), no un dato sensible
// de identidad.

/** Familia del documento — sólo pista para el tono del resumen. */
export type DocKind = 'informe' | 'articulo' | 'journal' | 'contrato' | 'nota' | 'otro'

/** Tipos de memoria válidos para un documento (subset del enum de `memories`). */
export type DocMemoryType = 'semantic' | 'episodic' | 'emotional' | 'temporal'

/** Una memoria propuesta desde el documento (editable en el preview). */
export interface DocMemoryProposal {
  type: DocMemoryType
  title: string
  content: string
  importance: number // 1..10
  tags: string[]
}

/** Resultado de la fase PREVIEW (LLM ya estructuró, nada persistido aún). */
export interface DocumentIngestPreview {
  preview: true
  /** Hash estable del texto — se devuelve al confirmar para derivar ids idempotentes. */
  docHash: string
  title: string
  docKind: DocKind
  /** true si el texto era legible/procesable; false si parece un scan vacío. */
  legible: boolean
  /** Resumen en prosa (markdown liviano) para dar contexto en el preview. */
  summary: string
  memories: DocMemoryProposal[]
  meta: {
    chars: number
    pagesRead?: number
    totalPages?: number
  }
}

/** Resultado de la fase CONFIRM (memorias insertadas). */
export interface DocumentIngestResult {
  saved: true
  inserted: number
  skipped: number
  personId: string | null
}
