// SIR V2 — Targets Engine: cross-check de goals financieros y de salud
// contra la data real, para el cockpit de arranque de julio.
//
// Aaron tiene 2 objetivos con métrica dura y verificable:
//   - Ingresos: subir de ~S/6,173/mes a S/15,000/mes.
//   - Peso: mantenerse en +80 kg (categoría Mundial WFG26 nov 2026).
//
// Este engine cruza los goals declarados con la data real (finance_movements
// para ingresos, health_metrics para peso) y devuelve una lectura simple: en
// track / cerca / fuera. Sin IA, sin narrativa — un chip y un número.
//
// Puro. `now` inyectable. Fail-safe: si no hay goals o data → devuelve
// state 'no_data' para que el componente no renderice.

import type { FinancialMovement, Goal, HealthMetric } from '@/types'

// ─── Ingresos: goal financiero con target parseable en soles ────────────

export type IncomeStatus = 'no_goal' | 'no_data' | 'on_track' | 'behind' | 'ahead'

export interface IncomeTargetProgress {
  status: IncomeStatus
  goalId: string | null
  goalTitle: string | null
  /** Meta mensual PEN parseada del `goal.target` ("S/15,000/mes"). */
  targetMonthly: number | null
  /** Promedio mensual real (últimos 3 meses cerrados). */
  currentMonthly: number | null
  /** targetMonthly - currentMonthly. Positivo = falta plata. */
  gapMonthly: number | null
  /** Meses hasta targetDate (o hasta fin de año como default). */
  monthsRemaining: number | null
  /** % del target que ya lograste (currentMonthly / targetMonthly * 100). */
  progressPct: number | null
}

/** Extrae el primer monto en soles del texto ("S/15,000", "15000", "15k"). */
function parseSolAmount(text: string): number | null {
  if (!text) return null
  // 15k, 15K → 15000
  const kMatch = text.match(/(\d{1,4})\s*k/i)
  if (kMatch) return parseInt(kMatch[1], 10) * 1000
  // S/15,000 o 15,000 o 15000 (respeta comas y puntos como separadores de miles)
  const numMatch = text.match(/s\/?\s*([\d.,]+)/i) ?? text.match(/([\d]{4,7}(?:[.,]\d{3})*)/)
  if (!numMatch) return null
  const cleaned = numMatch[1].replace(/[.,]/g, '')
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function monthKey(iso: string): string | null {
  return iso.length >= 7 ? iso.slice(0, 7) : null
}

/** Encuentra el goal financiero de "subir/aumentar ingresos" con target parseable. */
export function findIncomeGoal(goals: Goal[]): Goal | null {
  for (const g of goals) {
    if (g.status !== 'active') continue
    if (g.category !== 'financial') continue
    const title = g.title.toLowerCase()
    const isIncome = /ingres/i.test(title) || /sueld/i.test(title) || /salari/i.test(title)
    if (!isIncome) continue
    if (!g.target) continue
    if (parseSolAmount(g.target) == null) continue
    return g
  }
  return null
}

export function computeIncomeTargetProgress(
  goals: Goal[],
  financialMovements: FinancialMovement[],
  now: Date = new Date(),
): IncomeTargetProgress {
  const goal = findIncomeGoal(goals)
  if (!goal) {
    return {
      status: 'no_goal', goalId: null, goalTitle: null,
      targetMonthly: null, currentMonthly: null, gapMonthly: null,
      monthsRemaining: null, progressPct: null,
    }
  }
  const targetMonthly = parseSolAmount(goal.target ?? '')
  if (targetMonthly == null) {
    return {
      status: 'no_data', goalId: goal.id, goalTitle: goal.title,
      targetMonthly: null, currentMonthly: null, gapMonthly: null,
      monthsRemaining: null, progressPct: null,
    }
  }

  // Ingresos por mes de los últimos 3 meses CERRADOS (excluye el mes en curso
  // que aún no terminó). Promedio.
  const nowY = now.getFullYear()
  const nowM = now.getMonth() // 0-11
  const targetMonths: string[] = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(nowY, nowM - i, 1)
    targetMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const perMonth: Record<string, number> = {}
  for (const m of financialMovements) {
    if (m.type !== 'income') continue
    const key = monthKey(m.date)
    if (!key || !targetMonths.includes(key)) continue
    perMonth[key] = (perMonth[key] ?? 0) + m.amountPEN
  }
  const monthsWithData = Object.values(perMonth)
  const currentMonthly = monthsWithData.length > 0
    ? monthsWithData.reduce((s, v) => s + v, 0) / monthsWithData.length
    : null

  if (currentMonthly == null) {
    return {
      status: 'no_data', goalId: goal.id, goalTitle: goal.title,
      targetMonthly, currentMonthly: null, gapMonthly: null,
      monthsRemaining: null, progressPct: null,
    }
  }

  const gapMonthly = targetMonthly - currentMonthly
  const progressPct = Math.round((currentMonthly / targetMonthly) * 100)

  // Meses hasta la fecha objetivo. Si no hay, tomamos fin de año.
  let monthsRemaining: number | null = null
  if (goal.targetDate) {
    const [y, m] = goal.targetDate.slice(0, 7).split('-').map(Number)
    if (y && m) monthsRemaining = (y - nowY) * 12 + (m - 1 - nowM)
  }
  if (monthsRemaining == null || monthsRemaining < 0) {
    monthsRemaining = 12 - nowM // hasta dic incl.
  }

  const status: IncomeStatus =
    progressPct >= 95 ? 'on_track' :
    progressPct >= 65 ? 'behind' :
    'behind'
  // 'ahead' se reserva para cuando currentMonthly > targetMonthly (raro pero
  // no imposible en un mes bueno con clientes puntuales).
  const finalStatus: IncomeStatus = currentMonthly > targetMonthly ? 'ahead' : status

  return {
    status: finalStatus,
    goalId: goal.id,
    goalTitle: goal.title,
    targetMonthly,
    currentMonthly: Math.round(currentMonthly),
    gapMonthly: Math.round(gapMonthly),
    monthsRemaining,
    progressPct,
  }
}

// ─── Mundial WFG26: peso categoría +80 kg ────────────────────────────────

export type WeightStatus = 'no_goal' | 'no_data' | 'in_range' | 'below_min' | 'above_max' | 'close_to_edge'

export interface MundialWeightAlert {
  status: WeightStatus
  goalId: string | null
  goalTitle: string | null
  currentKg: number | null
  categoryMinKg: number | null
  categoryMaxKg: number | null
  /** Días hasta el evento (targetDate del goal). */
  daysToEvent: number | null
  /** Última fecha registrada (para saber si el dato está fresco). */
  lastRecordedIso: string | null
}

/** Detecta el goal del Mundial: category deporte/salud + título con "Mundial". */
export function findMundialGoal(goals: Goal[]): Goal | null {
  for (const g of goals) {
    if (g.status !== 'active') continue
    if (!/mundial|taekwondo|wfg/i.test(g.title + ' ' + (g.description ?? ''))) continue
    return g
  }
  return null
}

/** Parsea la CATEGORÍA de peso del target/anchorSubtitle ("+80 kg", "80-87 kg",
 *  "categoría +80 kg", etc.) — devuelve {min, max}. Fail-safe. */
export function parseWeightCategory(text: string | undefined): { min: number; max: number } | null {
  if (!text) return null
  // "+80 kg" o "+80" → min=80, max=87 (categoría abierta hasta el siguiente umbral)
  const plusMatch = text.match(/\+\s*(\d{2,3})\s*(?:kg)?/i)
  if (plusMatch) {
    const min = parseInt(plusMatch[1], 10)
    if (Number.isFinite(min)) return { min, max: min + 7 }
  }
  // "80-87 kg" → min=80, max=87
  const rangeMatch = text.match(/(\d{2,3})\s*[-–]\s*(\d{2,3})\s*(?:kg)?/i)
  if (rangeMatch) {
    return { min: parseInt(rangeMatch[1], 10), max: parseInt(rangeMatch[2], 10) }
  }
  return null
}

export function computeMundialWeightAlert(
  goals: Goal[],
  healthMetrics: HealthMetric[],
  now: Date = new Date(),
): MundialWeightAlert {
  const goal = findMundialGoal(goals)
  if (!goal) {
    return {
      status: 'no_goal', goalId: null, goalTitle: null,
      currentKg: null, categoryMinKg: null, categoryMaxKg: null,
      daysToEvent: null, lastRecordedIso: null,
    }
  }
  const range = parseWeightCategory(goal.target) ?? parseWeightCategory(goal.anchorSubtitle) ?? parseWeightCategory(goal.description)
  if (!range) {
    return {
      status: 'no_data', goalId: goal.id, goalTitle: goal.title,
      currentKg: null, categoryMinKg: null, categoryMaxKg: null,
      daysToEvent: null, lastRecordedIso: null,
    }
  }

  // Última lectura de peso.
  const weights = healthMetrics
    .filter((m) => m.type === 'weight' && Number.isFinite(m.value))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  if (weights.length === 0) {
    const daysToEvent = goal.targetDate ? daysBetween(now, goal.targetDate) : null
    return {
      status: 'no_data', goalId: goal.id, goalTitle: goal.title,
      currentKg: null, categoryMinKg: range.min, categoryMaxKg: range.max,
      daysToEvent, lastRecordedIso: null,
    }
  }
  const currentKg = weights[0].value
  const lastRecordedIso = weights[0].timestamp

  // Buffer de 1kg antes de disparar "close_to_edge".
  const CLOSE_BUFFER = 1
  let status: WeightStatus
  if (currentKg < range.min) status = 'below_min'
  else if (currentKg > range.max) status = 'above_max'
  else if (currentKg - range.min < CLOSE_BUFFER || range.max - currentKg < CLOSE_BUFFER) status = 'close_to_edge'
  else status = 'in_range'

  const daysToEvent = goal.targetDate ? daysBetween(now, goal.targetDate) : null

  return {
    status, goalId: goal.id, goalTitle: goal.title,
    currentKg: Math.round(currentKg * 10) / 10,
    categoryMinKg: range.min,
    categoryMaxKg: range.max,
    daysToEvent, lastRecordedIso,
  }
}

function daysBetween(now: Date, iso: string): number {
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return 0
  const target = new Date(y, m - 1, d).getTime()
  return Math.round((target - nowDay) / 86_400_000)
}
