// SIR V2 — Heart-rate panel capture types
//
// Mapeo entre lo que devuelve Claude Vision sobre un screenshot de la vista
// "Frecuencia cardíaca > Día" de una app de salud (Huawei Health/Salud, Apple
// Health/Salud, Samsung Health, Fitbit, Garmin, etc.) y filas de health_metrics.
//
// Es DATA PROPIA de Aaron (capa biológica, self) — NO se vincula a una persona,
// igual que la báscula y el panel de sueño. Va a `health_metrics` y alimenta /yo
// (la FC de reposo es la señal PRINCIPAL/verdad: corrige el valor manual
// elevado, porque los consumidores leen la FC más reciente por timestamp).
//
// Mapeo (idéntico a la ingesta de Apple Health, lib/health/ingest/parse.ts):
//   - resting_bpm → type 'heart_rate'      (la verdad; en reposo)
//   - min_bpm     → type 'heart_rate_min'  (rango diario, NUNCA reposo)
//   - max_bpm     → type 'heart_rate_max'  (rango diario)
//   - avg_bpm     → type 'heart_rate_avg'  (promedio del día, si aparece)

/**
 * JSON estricto que devuelve el endpoint /api/capture/hr. Todos los campos
 * son opcionales — Vision sólo retorna lo que el panel muestra con claridad.
 */
export interface HeartRatePanelExtracted {
  /** Día del registro en TZ LOCAL del panel ('YYYY-MM-DD'), o null si ilegible. */
  date: string | null
  /** FC EN REPOSO en p.p.m. (ej. 45) — el dato clave/verdad, o null. */
  resting_bpm: number | null
  /** Mínimo del rango de FC del día (ej. 44), o null. */
  min_bpm: number | null
  /** Máximo del rango de FC del día (ej. 138), o null. */
  max_bpm: number | null
  /** FC promedio del día si el panel la muestra, o null. */
  avg_bpm: number | null
  /** Conteo de alertas de FC ELEVADA si el panel las muestra, o null. */
  high_alerts: number | null
  /** Conteo de alertas de FC BAJA si el panel las muestra, o null. */
  low_alerts: number | null
  confidence: 'high' | 'medium' | 'low'
  /** Notas breves del modelo en español (max ~200 chars). */
  raw_observations?: string
}

/** Error response del endpoint. */
export interface HeartRateCaptureError {
  error: string
  detail?: string
}

/** Campos que el usuario confirma/edita en el preview antes de guardar.
 *  Espejo de HeartRatePanelExtracted pero con `day` ya resuelto a un valor
 *  concreto (no null) — el build lo necesita determinístico. */
export interface HeartRateCaptureFinal {
  /** 'YYYY-MM-DD' en TZ local — clave de dedupe por día. */
  day: string
  /** FC en reposo (verdad), o null. */
  restingBpm: number | null
  /** Mínimo del rango diario, o null. */
  minBpm: number | null
  /** Máximo del rango diario, o null. */
  maxBpm: number | null
  /** Promedio del día, o null. */
  avgBpm: number | null
  /** Conteo de alertas de FC elevada, o null. */
  highAlerts: number | null
  /** Conteo de alertas de FC baja, o null. */
  lowAlerts: number | null
  confidence: 'high' | 'medium' | 'low'
}
