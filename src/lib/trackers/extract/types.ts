// SIR V2 — Tipos de la extracción Vision/texto de un punto de tracker.

export type ExtractConfidence = 'high' | 'medium' | 'low'

/** Lo que Vision (o el parser de texto) devuelve por captura. */
export interface TrackerExtracted {
  /** Valor numérico relevante (el monto/medida). null si no se leyó. */
  value: number | null
  /** Unidad/moneda detectada (ej. "PEN", "USD"). null si no aplica. */
  unit: string | null
  /** Fecha de la lectura, date-only ISO 'YYYY-MM-DD'. null si no se halló. */
  date: string | null
  confidence: ExtractConfidence
  /** Observaciones de calidad/legibilidad (máx 200 chars). */
  raw_observations: string
}

export interface TrackerExtractError {
  error: string
  detail?: string
}

/** Pista opcional para Vision: qué métrica seguir (desambigua qué número leer). */
export interface ExtractHint {
  label?: string
  unit?: string
}
