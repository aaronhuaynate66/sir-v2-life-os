// SIR V2 — Tipos de longitudinal_summaries (Fase 3c, migration 0016).
//
// Resumen periodico (semanal) generado por LLM sobre el historial del
// usuario. Cache + historial: se conservan todas las generaciones.

export type PeriodKind = 'weekly' | 'monthly'

export interface LongitudinalSummary {
  id: string
  periodKind: PeriodKind
  /** ISO date-only YYYY-MM-DD. */
  periodStart: string
  periodEnd: string
  /** Prosa estructurada (Resumen / Patrones / Destacado / Próxima semana). */
  summaryText: string
  /** Conteos de fuentes que alimentaron el resumen (logs/observations/memories). */
  sourceCounts: Record<string, number>
  modelUsed: string
  inputTokens: number | null
  outputTokens: number | null
  generatedAt: string
}

export interface LongitudinalSummaryError {
  error: string
  detail?: string
}
