// SIR V2 — VFC/HRV panel capture types.
// Pantalla de "VFC" (variabilidad de la frecuencia cardíaca) de una app de salud
// (Huawei Health, Apple Health, etc.). Valores en MILISEGUNDOS (ms), NO bpm.
// Data PROPIA (capa biológica, self) → health_metrics (hrv_min/max/avg). No
// vincula persona, igual que FC/sueño/báscula.

export interface HrvPanelExtracted {
  /** Día del registro ('YYYY-MM-DD') o null. */
  date: string | null
  /** VFC en reposo/representativa en ms, o null. */
  resting_ms: number | null
  /** Mínimo del rango VFC del día (ms), o null. */
  min_ms: number | null
  /** Máximo del rango VFC del día (ms), o null. */
  max_ms: number | null
  /** VFC promedio del día (ms) si aparece, o null. */
  avg_ms: number | null
  confidence: 'high' | 'medium' | 'low'
  raw_observations?: string
}

export interface HrvCaptureError {
  error: string
  detail?: string
}

/** Campos confirmados/editados en el preview antes de guardar. */
export interface HrvCaptureFinal {
  day: string
  restingMs: number | null
  minMs: number | null
  maxMs: number | null
  avgMs: number | null
  confidence: 'high' | 'medium' | 'low'
}
