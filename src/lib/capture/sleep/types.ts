// SIR V2 — Sleep panel capture types
//
// Mapeo entre lo que devuelve Claude Vision sobre un screenshot de una app de
// monitoreo de sueño (Huawei Health, Apple Health/Salud, Samsung Health, etc.)
// y un SleepRecord de SIR.
//
// Es DATA PROPIA de Aaron (capa biológica, self) — NO se vincula a una persona,
// igual que la báscula. Va a `sleep_records` y alimenta /yo (Sueño prom., Calidad
// sueño, Deuda sueño) + el chart de horas + el motor biológico.

/** Fases del sueño en MINUTOS. Cada una opcional: Vision sólo reporta las
 *  que el panel muestra. Distintas apps exponen distintos cortes. */
export interface SleepStageMinutes {
  /** Sueño profundo (deep). */
  deep_minutes: number | null
  /** Sueño liviano / ligero / core (light). */
  light_minutes: number | null
  /** REM. */
  rem_minutes: number | null
  /** Vigilia / despierto durante la noche (awake). */
  awake_minutes: number | null
}

/**
 * JSON estricto que devuelve el endpoint /api/capture/sleep. Todos los campos
 * son opcionales — Vision sólo retorna lo que el panel muestra con claridad.
 */
export interface SleepPanelExtracted {
  /** Día del registro en TZ LOCAL del panel ('YYYY-MM-DD'), o null si ilegible.
   *  Convención SIR: la "fecha" de una noche es el día del despertar. */
  date: string | null
  /** Duración total dormida en MINUTOS (ej. 355 = 5h 55min), o null. */
  total_minutes: number | null
  /** Hora de dormir 'HH:mm' (24h), o null. */
  bedtime: string | null
  /** Hora de despertar 'HH:mm' (24h), o null. */
  wake_time: string | null
  /** Fases en minutos. */
  stages: SleepStageMinutes
  /** Puntuación de calidad 0-100 (ej. 75), o null. */
  score: number | null
  /** Cantidad de despertares durante la noche (ej. 1), o null. */
  awakenings: number | null
  /** Frecuencia respiratoria promedio en respiraciones/min (ej. 15), o null. */
  respiratory_rate: number | null
  /** SpO₂ promedio durante el sueño en % (ej. 98), o null. */
  spo2_avg: number | null
  /** Minutos de SIESTA (diurna), separados del sueño nocturno, o null. */
  nap_minutes: number | null
  confidence: 'high' | 'medium' | 'low'
  /** Notas breves del modelo en español (max ~200 chars). */
  raw_observations?: string
}

/** Error response del endpoint. */
export interface SleepCaptureError {
  error: string
  detail?: string
}

/** Campos que el usuario confirma/edita en el preview antes de guardar.
 *  Espejo de SleepPanelExtracted pero con `date`/duración ya resueltos a
 *  valores concretos (no null) — el build los necesita determinísticos. */
export interface SleepCaptureFinal {
  /** 'YYYY-MM-DD' en TZ local — clave de dedupe por día. */
  day: string
  /** Duración total dormida en minutos. */
  totalMinutes: number
  bedtime: string | null
  wakeTime: string | null
  stages: SleepStageMinutes
  score: number | null
  awakenings: number | null
  respiratoryRate: number | null
  spo2Avg: number | null
  napMinutes: number | null
  confidence: 'high' | 'medium' | 'low'
}
