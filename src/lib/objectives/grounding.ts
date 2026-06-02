// SIR V2 — Grounding context (Hito B): contexto REAL del usuario para el plan IA.
//
// PURO + determinístico: cero red, cero LLM. Resume la data que ya vive en los
// stores (finanzas, /yo, señales, relaciones vinculadas) en un objeto compacto
// y serializable, y lo renderiza a un bloque de texto que se inyecta en el
// prompt del plan. Así el plan y el análisis de feasibility se apoyan en la
// realidad del usuario, no en supuestos.
//
// PRIVACIDAD: sólo SUMMARIES (números/labels), nunca filas crudas ni notas
// libres. El diagnóstico personal de /yo (self_diagnosis) NO se toca: es data
// sensible que no sale de /yo. Es el mismo usuario consultando lo suyo.

import type {
  FinancialMovement,
  HealthMetric,
  MetricCategory,
  SelfMetric,
  Signal,
  SignalUrgency,
  SpendIntent,
} from '@/types'
import {
  analyzeFinancialStability,
  analyzeSpendingByIntent,
} from '@/engines/financial'

export interface GroundingFinance {
  /** Mes resumido, 'YYYY-MM'. */
  month: string
  incomePEN: number
  expensePEN: number
  balancePEN: number
  savingsRatePct: number
  byIntent: { intent: SpendIntent; totalPEN: number; pct: number }[]
  unclassifiedPEN: number
}

export interface GroundingBody {
  weightKg?: number
  /** ISO del último pesaje. */
  weightAt?: string
  bmi?: number
  bodyFatPct?: number
}

export interface GroundingWellbeing {
  /** Última medición por categoría (energy/stress/…). */
  metrics: { category: MetricCategory; value: number; at: string }[]
}

export interface GroundingSignals {
  activeCount: number
  top: { content: string; urgency: SignalUrgency }[]
}

export interface GroundingContext {
  finance?: GroundingFinance
  body?: GroundingBody
  wellbeing?: GroundingWellbeing
  signals?: GroundingSignals
  /** Nombres de personas vinculadas al objetivo (no datos sensibles). */
  linkedPeople?: string[]
  /** true si no había NADA de contexto (el render se omite). */
  empty: boolean
}

export interface GroundingInput {
  financialMovements?: FinancialMovement[]
  healthMetrics?: HealthMetric[]
  selfMetrics?: SelfMetric[]
  signals?: Signal[]
  /** Nombres ya resueltos de las personas vinculadas al objetivo. */
  linkedPeople?: string[]
}

const URGENCY_RANK: Record<SignalUrgency, number> = {
  immediate: 0,
  soon: 1,
  monitor: 2,
  archive: 3,
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 'YYYY-MM' local del `now`. */
function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Resumen financiero del MES en curso (o undefined si no hay movimientos). */
function buildFinance(movements: FinancialMovement[], now: Date): GroundingFinance | undefined {
  const month = monthKey(now)
  const ofMonth = movements.filter((m) => typeof m.date === 'string' && m.date.slice(0, 7) === month)
  if (ofMonth.length === 0) return undefined
  const score = analyzeFinancialStability(ofMonth)
  const income = ofMonth.filter((m) => m.type === 'income').reduce((s, m) => s + m.amountPEN, 0)
  const expense = ofMonth.filter((m) => m.type === 'expense').reduce((s, m) => s + m.amountPEN, 0)
  const intent = analyzeSpendingByIntent(ofMonth)
  return {
    month,
    incomePEN: round2(income),
    expensePEN: round2(expense),
    balancePEN: score.monthlyBalance,
    savingsRatePct: score.savingsRate,
    byIntent: intent.items
      .filter((i) => i.totalPEN > 0)
      .map((i) => ({ intent: i.intent, totalPEN: i.totalPEN, pct: i.pct })),
    unclassifiedPEN: intent.unclassifiedPEN,
  }
}

/** Último valor de un HealthMetric de cierto tipo. */
function latestHealth(metrics: HealthMetric[], type: HealthMetric['type']): HealthMetric | undefined {
  let best: HealthMetric | undefined
  for (const m of metrics) {
    if (m.type !== type) continue
    if (!best || m.timestamp > best.timestamp) best = m
  }
  return best
}

function buildBody(metrics: HealthMetric[]): GroundingBody | undefined {
  const weight = latestHealth(metrics, 'weight')
  const bmi = latestHealth(metrics, 'bmi')
  const fat = latestHealth(metrics, 'body_fat_percent')
  if (!weight && !bmi && !fat) return undefined
  return {
    weightKg: weight?.value,
    weightAt: weight?.timestamp,
    bmi: bmi?.value,
    bodyFatPct: fat?.value,
  }
}

const WELLBEING_CATEGORIES: MetricCategory[] = [
  'energy',
  'stress',
  'mood',
  'focus',
  'motivation',
  'confidence',
]

function buildWellbeing(metrics: SelfMetric[]): GroundingWellbeing | undefined {
  const latest = new Map<MetricCategory, SelfMetric>()
  for (const m of metrics) {
    const cur = latest.get(m.category)
    if (!cur || m.timestamp > cur.timestamp) latest.set(m.category, m)
  }
  const out = WELLBEING_CATEGORIES.filter((c) => latest.has(c)).map((c) => {
    const m = latest.get(c)!
    return { category: c, value: m.value, at: m.timestamp }
  })
  return out.length > 0 ? { metrics: out } : undefined
}

function buildSignals(signals: Signal[]): GroundingSignals | undefined {
  const active = signals.filter((s) => !s.resolved)
  if (active.length === 0) return undefined
  const top = [...active]
    .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
    .slice(0, 5)
    .map((s) => ({ content: s.content, urgency: s.urgency }))
  return { activeCount: active.length, top }
}

/** Construye el contexto de grounding desde los stores (todo opcional). */
export function buildGroundingContext(input: GroundingInput, now: Date = new Date()): GroundingContext {
  const finance = buildFinance(input.financialMovements ?? [], now)
  const body = buildBody(input.healthMetrics ?? [])
  const wellbeing = buildWellbeing(input.selfMetrics ?? [])
  const signals = buildSignals(input.signals ?? [])
  const linkedPeople = input.linkedPeople && input.linkedPeople.length > 0 ? input.linkedPeople : undefined
  const empty = !finance && !body && !wellbeing && !signals && !linkedPeople
  return { finance, body, wellbeing, signals, linkedPeople, empty }
}

const INTENT_LABEL: Record<SpendIntent, string> = {
  obligatorio: 'obligatorio',
  necesario: 'necesario',
  no_esencial: 'no esencial',
}

/**
 * Renderiza el contexto a un bloque de texto compacto para el prompt. Devuelve
 * '' si no hay nada (el caller omite la sección de grounding).
 */
export function renderGroundingForPrompt(ctx: GroundingContext): string {
  if (ctx.empty) return ''
  const lines: string[] = ['DATOS REALES DEL USUARIO (usalos para aterrizar el plan y la feasibility):']

  if (ctx.finance) {
    const f = ctx.finance
    lines.push(
      `- Finanzas (mes ${f.month}): ingreso S/${f.incomePEN}, gasto S/${f.expensePEN}, balance S/${f.balancePEN}/mes, tasa de ahorro ${f.savingsRatePct}%.`,
    )
    if (f.byIntent.length > 0) {
      const parts = f.byIntent.map((i) => `${INTENT_LABEL[i.intent]} S/${i.totalPEN} (${i.pct}%)`)
      lines.push(`  Gasto por intención: ${parts.join(', ')}.`)
    }
    if (f.unclassifiedPEN > 0) lines.push(`  (S/${f.unclassifiedPEN} de gasto sin clasificar por intención.)`)
  }

  if (ctx.body) {
    const b = ctx.body
    const segs: string[] = []
    if (b.weightKg != null) segs.push(`peso ${b.weightKg} kg${b.weightAt ? ` (${b.weightAt.slice(0, 10)})` : ''}`)
    if (b.bmi != null) segs.push(`IMC ${b.bmi}`)
    if (b.bodyFatPct != null) segs.push(`grasa ${b.bodyFatPct}%`)
    if (segs.length > 0) lines.push(`- Cuerpo (báscula): ${segs.join(', ')}.`)
  }

  if (ctx.wellbeing) {
    const parts = ctx.wellbeing.metrics.map((m) => `${m.category} ${m.value}/10`)
    lines.push(`- Bienestar (últimas mediciones, 1-10): ${parts.join(', ')}.`)
  }

  if (ctx.signals) {
    const parts = ctx.signals.top.map((s) => `"${s.content}" (${s.urgency})`)
    lines.push(`- Señales activas (${ctx.signals.activeCount}): ${parts.join('; ')}.`)
  }

  if (ctx.linkedPeople) {
    lines.push(`- Personas vinculadas al objetivo: ${ctx.linkedPeople.join(', ')}.`)
  }

  return lines.join('\n')
}
