// SIR V2 — Resumen del Índice de Afecto Expresado (IAE) para surfacearlo. PURO.
//
// La señal `affection` (densidad 0..1) y `positivityRatio` (estilo Gottman) se
// computan por día y se persisten, pero el motor del forecast NO las usa (son una
// dimensión APARTE, ver mig 0158 / docs/research/indice-afecto-relacional.md). Sin
// este resumen morían sin llegar al usuario. Acá se condensan en nivel + tendencia
// + banda de ratio para mostrarlas.
//
// ÉTICA (doc 17 + indice-afecto-relacional): es un DISPARADOR DE CONVERSACIÓN, no
// un veredicto. "Afecto expresado ≠ afecto sentido" (Floyd). El texto lo enmarca así.

import type { DailySignal } from './types'

export type AffectionTrend = 'subiendo' | 'estable' | 'bajando'
export type RatioBand = 'muy positivo' | 'saludable' | 'mixto' | 'de cuidado'

export interface AffectionSummary {
  /** Días con mensajes considerados. */
  activeDays: number
  /** Promedio de densidad de afecto en la ventana reciente (0..1). */
  recentAffection: number
  /** Tendencia reciente vs. el período previo. null si no hay base para comparar. */
  trend: AffectionTrend | null
  /** Banda del ratio de positividad reciente (Gottman ~5:1). */
  ratioBand: RatioBand
  /** Ratio de positividad promedio reciente (≥0). */
  ratio: number
}

const RECENT_DAYS = 30
const MIN_ACTIVE = 12       // debajo de esto no decimos nada (ruido)
const MIN_PRIOR = 6         // mínimo para animarnos a hablar de tendencia
const TREND_DELTA = 0.04    // cambio de densidad que consideramos señal

function avg(ns: number[]): number {
  if (ns.length === 0) return 0
  return ns.reduce((a, b) => a + b, 0) / ns.length
}

function bandFor(ratio: number): RatioBand {
  if (ratio >= 5) return 'muy positivo'
  if (ratio >= 3) return 'saludable'
  if (ratio >= 1.2) return 'mixto'
  return 'de cuidado'
}

/**
 * Condensa la serie de afecto en un resumen mostrable. null si no hay suficientes
 * días activos para decir algo honesto. PURO.
 */
export function summarizeAffection(signals: readonly DailySignal[]): AffectionSummary | null {
  const active = signals.filter((s) => s.messageCount > 0)
  if (active.length < MIN_ACTIVE) return null

  const recent = active.slice(-RECENT_DAYS)
  const prior = active.slice(0, -RECENT_DAYS).slice(-RECENT_DAYS)

  const recentAffection = avg(recent.map((s) => s.affection))
  const ratio = avg(recent.map((s) => s.positivityRatio))

  let trend: AffectionTrend | null = null
  if (prior.length >= MIN_PRIOR) {
    const delta = recentAffection - avg(prior.map((s) => s.affection))
    trend = delta > TREND_DELTA ? 'subiendo' : delta < -TREND_DELTA ? 'bajando' : 'estable'
  }

  return {
    activeDays: active.length,
    recentAffection: Math.round(recentAffection * 100) / 100,
    trend,
    ratioBand: bandFor(ratio),
    ratio: Math.round(ratio * 10) / 10,
  }
}

/**
 * Frase cualitativa y de CUIDADO (no veredicto) a partir del resumen. Neutral en
 * género; quien la muestra antepone el nombre. null si no hay resumen.
 */
export function describeAffection(s: AffectionSummary | null | undefined): string | null {
  if (!s) return null
  const trendWord: Record<AffectionTrend, string> = {
    subiendo: 'viene subiendo',
    estable: 'se mantiene estable',
    bajando: 'viene bajando',
  }
  const bandWord: Record<RatioBand, string> = {
    'muy positivo': 'muy por encima de lo negativo',
    saludable: 'bastante más positivo que negativo',
    mixto: 'mezclado, positivo y negativo parejos',
    'de cuidado': 'con más roce que cariño últimamente',
  }
  const trendPart = s.trend ? `${trendWord[s.trend]}` : 'es lo que hay en el chat'
  return `el afecto expresado ${trendPart}; el balance reciente está ${bandWord[s.ratioBand]}`
}
