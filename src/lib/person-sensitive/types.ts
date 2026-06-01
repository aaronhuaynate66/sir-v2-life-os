// SIR V2 — Información sensible / datos adicionales por persona (1:1 people).
//
// Identidad-dura: documento (DNI), pasaporte, foto del documento. Tabla
// `person_sensitive_data` (migration 0025), separada por sensibilidad.
// MANEJO: nunca loguear, nunca a IA/embeddings, nunca al grafo ni summaries.

export interface PersonSensitiveData {
  documentoTipo?: string
  documentoNumero?: string
  pasaporteNumero?: string
  /** YYYY-MM-DD. */
  pasaporteVencimiento?: string
  /** Path en el bucket privado person-documents ({userId}/{personId}/...). */
  fotoDocumentoPath?: string | null
}
