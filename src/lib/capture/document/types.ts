// SIR V2 — Tipos de la extracción de documentos de identidad.

export interface DocumentExtracted {
  documentoTipo: string | null
  documentoNumero: string | null
  pasaporteNumero: string | null
  /** YYYY-MM-DD o null. */
  pasaporteVencimiento: string | null
}

export interface DocumentCaptureError {
  error: string
  detail?: string
}
