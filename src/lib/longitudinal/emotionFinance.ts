// SIR V2 — Correlación emocional ↔ financiera (P3, parte determinística).
//
// Cruza el ESTRÉS diario (self_metrics category='stress', 1-10) contra el
// GASTO NO-ESENCIAL diario (finance_movements con intent='no_esencial'),
// para detectar el patrón que describió Aaron: "estrés↑ → gasto hormiga↑".
//
// Reusa la capa longitudinal:
//   - aggregateByDay() (charts/series) para promediar/sumar por día.
//   - la MISMA filosofía de correlation.ts: buckets + delta high/low, mínimos
//     de muestra, y empty state honesto (correlación ≠ causa; si no hay data
//     suficiente NO inventamos un patrón).
//
// 100% determinístico: cero LLM, cero red. La narrativa interpretativa (si se
// quisiera) iría detrás de un botón, igual que correlationNarrative.ts.
//
// Determinismo TZ: agrupamos por la fecha date-only (prefijo YYYY-MM-DD del
// timestamp / date), consistente con aggregateByDay → medianoches estables.

import type { SelfMetric, FinancialMovement } from '@/types'
import { aggregateByDay } from '@/lib/charts/series'

// ─── Config + tipos de salida ───────────────────────────────────────

export type StressLevel = 'low' | 'medium' | 'high'

export interface StressSpendBucket {
  level: StressLevel
  label: string
  /** Días (con lectura de estrés) que cayeron en este nivel. */
  dayCount: number
  /** Suma del gasto no-esencial de esos días (PEN). */
  totalNonEssentialPEN: number
  /** Gasto no-esencial PROMEDIO por día. null si dayCount < minDaysPerBucket. */
  avgNonEssentialPEN: number | null
}

export interface EmotionFinanceCorrelation {
  /** Buckets en orden low → medium → high (incluye vacíos). */
  buckets: StressSpendBucket[]
  /** Días totales con lectura de estrés considerados. */
  totalDays: number
  /** high vs low (solo si ambos tienen días suficientes). */
  delta: { highAvg: number; lowAvg: number; diffPEN: number } | null
  /** true si el gasto no-esencial sube con el estrés (alto > bajo, margen claro). */
  hasPattern: boolean
  /** Frase determinística describiendo el patrón. null si no hay uno. */
  insight: string | null
  status: 'ok' | 'insufficient_data'
}

export interface EmotionFinanceConfig {
  /** Estrés ≤ este valor → nivel bajo. Default 4 (escala 1-10). */
  lowMax?: number
  /** Estrés ≥ este valor → nivel alto. Default 7. */
  highMin?: number
  /** Mínimo de días por bucket para promediar. Default 3. */
  minDaysPerBucket?: number
  /** Mínimo total de días con estrés para emitir status='ok'. Default 6. */
  minTotalDays?: number
}

const STRESS_CATEGORY: SelfMetric['category'] = 'stress'
const NON_ESSENTIAL: NonNullable<FinancialMovement['intent']> = 'no_esencial'
const OUTFLOW: ReadonlySet<FinancialMovement['type']> = new Set(['expense', 'debt'])

const LEVEL_LABEL: Record<StressLevel, string> = {
  low: 'Estrés bajo',
  medium: 'Estrés medio',
  high: 'Estrés alto',
}
const LEVEL_ORDER: StressLevel[] = ['low', 'medium', 'high']

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Núcleo ─────────────────────────────────────────────────────────

/**
 * Empareja, por día, el estrés promedio con el gasto no-esencial de ese día y
 * lo agrupa en buckets de nivel de estrés. Días sin gasto no-esencial cuentan
 * con gasto 0 (informativo: "ese día estresado no gasté"). Solo los días con
 * lectura de estrés forman el universo.
 */
export function correlateStressVsNonEssentialSpend(
  metrics: SelfMetric[],
  movements: FinancialMovement[],
  config: EmotionFinanceConfig = {},
): EmotionFinanceCorrelation {
  const lowMax = config.lowMax ?? 4
  const highMin = config.highMin ?? 7
  const minDaysPerBucket = config.minDaysPerBucket ?? 3
  const minTotalDays = config.minTotalDays ?? 6

  // Estrés promedio por día (1-10).
  const stressByDay = aggregateByDay(
    metrics.filter((m) => m.category === STRESS_CATEGORY).map((m) => ({ date: m.timestamp, value: m.value })),
    'avg',
  )
  // Gasto no-esencial sumado por día (PEN).
  const spendByDay = aggregateByDay(
    movements
      .filter((m) => OUTFLOW.has(m.type) && m.intent === NON_ESSENTIAL)
      .map((m) => ({ date: m.date, value: Number.isFinite(m.amountPEN) ? m.amountPEN : 0 })),
    'sum',
  )
  const spendMap = new Map(spendByDay.map((p) => [p.date, p.value]))

  // Acumuladores por nivel.
  const acc: Record<StressLevel, { days: number; sum: number }> = {
    low: { days: 0, sum: 0 },
    medium: { days: 0, sum: 0 },
    high: { days: 0, sum: 0 },
  }

  for (const day of stressByDay) {
    const level: StressLevel = day.value <= lowMax ? 'low' : day.value >= highMin ? 'high' : 'medium'
    const spend = spendMap.get(day.date) ?? 0
    acc[level].days += 1
    acc[level].sum += spend
  }

  const buckets: StressSpendBucket[] = LEVEL_ORDER.map((level) => {
    const a = acc[level]
    return {
      level,
      label: LEVEL_LABEL[level],
      dayCount: a.days,
      totalNonEssentialPEN: round2(a.sum),
      avgNonEssentialPEN: a.days >= minDaysPerBucket ? round2(a.sum / a.days) : null,
    }
  })

  const totalDays = stressByDay.length

  // Delta high vs low: solo si ambos buckets tienen promedio (días suficientes).
  const lowB = buckets[0]
  const highB = buckets[2]
  let delta: EmotionFinanceCorrelation['delta'] = null
  if (lowB.avgNonEssentialPEN != null && highB.avgNonEssentialPEN != null) {
    delta = {
      highAvg: highB.avgNonEssentialPEN,
      lowAvg: lowB.avgNonEssentialPEN,
      diffPEN: round2(highB.avgNonEssentialPEN - lowB.avgNonEssentialPEN),
    }
  }

  // Patrón: el gasto sube con el estrés con un margen CLARO (no ruido).
  //   - si en estrés bajo gastás ~0, basta que en alto gastes algo notable.
  //   - si no, exigimos ≥20% más en alto que en bajo.
  let hasPattern = false
  if (delta && delta.diffPEN > 0) {
    hasPattern = delta.lowAvg < 1 ? delta.highAvg >= 10 : delta.highAvg / delta.lowAvg >= 1.2
  }

  const status: EmotionFinanceCorrelation['status'] = totalDays >= minTotalDays ? 'ok' : 'insufficient_data'

  let insight: string | null = null
  if (status === 'ok' && hasPattern && delta) {
    const pct = delta.lowAvg > 0 ? Math.round((delta.diffPEN / delta.lowAvg) * 100) : null
    const extra = pct != null ? ` (~${pct}% más)` : ''
    insight =
      `En días de estrés alto gastaste en promedio S/ ${delta.highAvg.toFixed(0)} en no-esencial, ` +
      `vs S/ ${delta.lowAvg.toFixed(0)} en días de estrés bajo${extra}.`
  }

  return { buckets, totalDays, delta, hasPattern, insight, status }
}
