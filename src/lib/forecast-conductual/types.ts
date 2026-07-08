// SIR V2 — Forecast conductual por conversación (MVP de Aaron). Tipos.
//
// SEGUNDO horizonte, en PARALELO al del ciclo real (person_cycles): infiere
// ventanas conductuales candidatas desde la CONDUCTA del chat (léxico puro, sin
// LLM), no desde fechas confirmadas. NO diagnostica período/ovulación — proyecta
// "ventanas donde suele aparecer un patrón" (fricción/retiro/sensibilidad/
// somático). Ético (doc 17): tendencia, no certeza; cuidado, no ventaja.

/** Un mensaje ya parseado del export (adaptado desde lib/capture/whatsapp/export/parse). */
export interface ChatMessage {
  /** ISO datetime o al menos 'YYYY-MM-DD'. */
  at: string
  /** 'other' = la persona rastreada; 'user' = Aaron. */
  author: 'user' | 'other'
  text: string
  kind?: 'text' | 'audio' | 'image' | 'sticker' | 'media'
}

/** Vector de señales de UN día (todas 0..1). */
export interface DailySignal {
  date: string // YYYY-MM-DD
  messageCount: number
  avgLen: number
  somatic: number
  friction: number
  withdrawal: number
  sensitivity: number
  actions: number
  /** Compuesto ponderado (0..1). Es la serie que alimenta el motor. */
  composite: number
}

/** Ancla confirmada (mapea a person_cycles: bleeding/pms → period_start/pms). */
export interface CycleAnchor {
  date: string // YYYY-MM-DD
  type: 'period_start' | 'pms' | 'other'
  confidence?: 'high' | 'medium' | 'low'
}

export type ForecastMode = 'exploratory' | 'calibrated'

export interface ModelOutput {
  name: 'grid' | 'interpeak' | 'autocorr' | 'harmonic' | 'bayes'
  periodDays: number | null
  /** índice de día (desde el día 0 de la serie) del centro proyectado. */
  centerIndex: number | null
  score: number // 0..1 cuán confiable es este modelo
}

export interface BehaviorForecast {
  mode: ForecastMode
  centerDate: string | null
  mainWindow: { start: string; end: string } | null      // ±2 días
  extendedWindow: { start: string; end: string } | null  // ±3 días
  periodDays: number | null
  confidence: { label: 'baja' | 'baja-media' | 'media' | 'media-alta' | 'alta'; score: number }
  dominantModels: ModelOutput['name'][]
  models: ModelOutput[]
  /** Δ% de cada señal en los picos históricos vs el baseline. */
  usualPattern: { friction: number; withdrawal: number; sensitivity: number; somatic: number }
  interpretation: string
  /** Cobertura de la data para ser honestos con la incertidumbre. */
  coverage: { days: number; activeDays: number; spanDays: number; peaks: number; anchors: number }
}
