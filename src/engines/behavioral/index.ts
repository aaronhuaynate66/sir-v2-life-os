// SIR V2 — Behavioral Suggestion Engine (E3 hueco #4 del roadmap).
//
// Cierra el loop de la Etapa 3 (Behavioral Intelligence): la maquinaria de
// correlación (src/lib/longitudinal/correlation.ts) ya cruza señales — este
// engine da el ÚLTIMO paso: cuando el estrés sube, el sueño baja y el gasto
// no-esencial sube al mismo tiempo, sale una SUGERENCIA CONDUCTUAL para
// romper el bucle antes de que se pague solo (delivery caro, mal día
// siguiente, etc.).
//
// Base científica (behavioral economics / self-regulation):
//   - Ego depletion → cuando el autocontrol está gastado por estrés o falta
//     de sueño, las decisiones impulsivas (delivery, compras) suben.
//   - Sleep debt loop → dormir <7h por 2+ días degrada la reserva emocional
//     Y la capacidad de decisiones financieras (Christensen 2020, etc).
//
// DISEÑO — INVARIANTES:
//   1. NO CLÍNICO. Nada de "podría ser ansiedad" o "consultá a un
//      profesional". La sugerencia es de acción concreta y práctica —
//      cocinar, caminar, cerrar pantallas, escribirle a alguien.
//   2. UNA sola sugerencia por vez. Elegimos la más urgente (priority) para
//      no ahogar al usuario. Si no hay patrones → devuelve null.
//   3. DETERMINÍSTICO Y PURO. Sin red, sin LLM. `now` inyectable para tests.
//   4. FAIL-SAFE. Si faltan datos (menos de 3 días de metrics o sin stress
//      logs) → return null. No inventamos brechas.
//   5. Cero juicio. El copy es reflexivo, no imperativo. "Probá cocinar hoy"
//      en vez de "no pidas delivery".

import type { FinancialMovement, SelfMetric, SleepRecord } from '@/types'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

export type BehavioralPatternKind =
  | 'stress_sleep_spend'  // A: los 3 al mismo tiempo → sugerencia de romper el bucle
  | 'stress_streak'       // B: estrés alto 3+ días → sugerencia de restauración
  | 'sleep_debt'          // C: sueño <6h 2+ días → sugerencia de higiene del sueño

export type BehavioralPriority = 'critical' | 'high' | 'medium'

export interface BehavioralSuggestion {
  kind: BehavioralPatternKind
  priority: BehavioralPriority
  /** Título corto (chip/header). */
  title: string
  /** Lectura honesta y calmada de lo que se observó (dato → sin juicio). */
  observation: string
  /** Sugerencia concreta y práctica. NO clínica, NO imperativa. */
  suggestion: string
  /** Datos crudos usados (para debug + narrativa opcional). */
  evidence: {
    avgStress?: number
    avgSleepHours?: number
    nonEssentialSpend?: number
    daysCovered: number
  }
}

interface DailyMetrics {
  /** YYYY-MM-DD → promedio de stress ese día (0-10, o null si no hay). */
  stressByDay: Record<string, number>
  sleepByDay: Record<string, number>
  spendByDay: Record<string, number>
  daysCovered: number
}

const WINDOW_DAYS = 7
const STRESS_HIGH = 6 // 0-10; ≥6 considera "alto"
const SLEEP_DEBT_HOURS = 6 // <6h de sueño = deuda
const SLEEP_LIGHT_DEBT_HOURS = 7 // <7h = deuda leve
const NON_ESSENTIAL_THRESHOLD_PEN = 300 // 7d, umbral para "gasto hormiga notable"

function toDayKey(iso: string): string | null {
  return iso ? iso.slice(0, 10) : null
}

function isoDayFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inWindow(dayIso: string, nowMs: number, windowMs: number): boolean {
  const d = parseLocalDate(dayIso)
  if (!d) return false
  const ms = d.getTime()
  return ms >= nowMs - windowMs && ms <= nowMs
}

/**
 * Agrupa las métricas por día en la ventana. Puro.
 * - stress: promedio de todas las lecturas category='stress' del día
 * - sleep: `duration` de la última lectura del día
 * - spend: suma de amountPEN de expense/debt con intent='no_esencial' del día
 */
export function aggregateBehavioralWindow(
  selfMetrics: SelfMetric[],
  sleepRecords: SleepRecord[],
  financialMovements: FinancialMovement[],
  now: Date,
  windowDays: number = WINDOW_DAYS,
): DailyMetrics {
  const nowMs = now.getTime()
  const windowMs = windowDays * 86_400_000
  const stressAcc: Record<string, number[]> = {}
  const sleepAcc: Record<string, number> = {}
  const spendAcc: Record<string, number> = {}

  for (const m of selfMetrics) {
    if (m.category !== 'stress') continue
    const key = toDayKey(m.timestamp)
    if (!key || !inWindow(key, nowMs, windowMs)) continue
    ;(stressAcc[key] ??= []).push(m.value)
  }
  for (const r of sleepRecords) {
    const key = toDayKey(r.date)
    if (!key || !inWindow(key, nowMs, windowMs)) continue
    // Última lectura del día gana (patrón consistente con adapters.ts).
    sleepAcc[key] = r.duration
  }
  for (const f of financialMovements) {
    if (f.type !== 'expense' && f.type !== 'debt') continue
    if (f.intent !== 'no_esencial') continue
    const key = toDayKey(f.date)
    if (!key || !inWindow(key, nowMs, windowMs)) continue
    spendAcc[key] = (spendAcc[key] ?? 0) + f.amountPEN
  }

  const stressByDay: Record<string, number> = {}
  for (const [k, vals] of Object.entries(stressAcc)) {
    stressByDay[k] = vals.reduce((s, v) => s + v, 0) / vals.length
  }

  const daysWithAnyData = new Set([
    ...Object.keys(stressByDay),
    ...Object.keys(sleepAcc),
    ...Object.keys(spendAcc),
  ]).size

  return { stressByDay, sleepByDay: sleepAcc, spendByDay: spendAcc, daysCovered: daysWithAnyData }
}

function avg(vals: number[]): number {
  return vals.length === 0 ? 0 : vals.reduce((s, v) => s + v, 0) / vals.length
}

function sum(vals: number[]): number {
  return vals.reduce((s, v) => s + v, 0)
}

/**
 * Cuenta cuántos días consecutivos terminan en `now` (o el más reciente hacia
 * atrás) con `pred` true. Puro. Se usa para "estrés alto 3+ días seguidos".
 */
function consecutiveDaysMatching(
  daily: Record<string, number>,
  now: Date,
  pred: (v: number) => boolean,
): number {
  let count = 0
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = isoDayFromDate(d)
    const v = daily[key]
    if (v === undefined) break
    if (!pred(v)) break
    count++
  }
  return count
}

/**
 * Detecta EL patrón conductual más urgente y devuelve UNA sugerencia (o null
 * si no hay uno claro). Priority: critical > high > medium.
 */
export function detectBehavioralPattern(
  selfMetrics: SelfMetric[],
  sleepRecords: SleepRecord[],
  financialMovements: FinancialMovement[],
  now: Date = new Date(),
): BehavioralSuggestion | null {
  const w = aggregateBehavioralWindow(selfMetrics, sleepRecords, financialMovements, now)
  // Sin al menos 3 días de datos → no inventamos patrones.
  if (w.daysCovered < 3) return null

  const stressVals = Object.values(w.stressByDay)
  const sleepVals = Object.values(w.sleepByDay)
  const totalSpend = sum(Object.values(w.spendByDay))

  const avgStress = stressVals.length > 0 ? avg(stressVals) : null
  const avgSleep = sleepVals.length > 0 ? avg(sleepVals) : null

  // Patrón A — STRESS + SLEEP + SPEND (los 3 al mismo tiempo, ventana 7d).
  if (
    avgStress != null &&
    avgStress >= STRESS_HIGH &&
    avgSleep != null &&
    avgSleep < SLEEP_LIGHT_DEBT_HOURS &&
    totalSpend >= NON_ESSENTIAL_THRESHOLD_PEN
  ) {
    return {
      kind: 'stress_sleep_spend',
      priority: 'critical',
      title: 'El bucle del estrés se te está pagando',
      observation: `En los últimos ${w.daysCovered} días: estrés promedio ${avgStress.toFixed(1)}/10, sueño promedio ${avgSleep.toFixed(1)}h, gasto no-esencial S/${totalSpend.toFixed(0)}. Los 3 suben al mismo tiempo — es un patrón, no una casualidad.`,
      suggestion: 'Cocina hoy en vez de mirar Rappi. Cerrá pantallas 30min antes de dormir. Un cambio chico corta la cadena — no todo a la vez.',
      evidence: {
        avgStress: Math.round(avgStress * 10) / 10,
        avgSleepHours: Math.round(avgSleep * 10) / 10,
        nonEssentialSpend: Math.round(totalSpend),
        daysCovered: w.daysCovered,
      },
    }
  }

  // Patrón B — Estrés alto 3+ días seguidos (aunque sueño y gasto estén ok).
  const stressStreak = consecutiveDaysMatching(w.stressByDay, now, (v) => v >= STRESS_HIGH)
  if (stressStreak >= 3) {
    return {
      kind: 'stress_streak',
      priority: 'high',
      title: `${stressStreak} días con estrés alto`,
      observation: `Tu estrés lleva ${stressStreak} días arriba de ${STRESS_HIGH}/10. Suele bajar solo si le das aire.`,
      suggestion: 'Salí a caminar 20 min sin celular. O llamá a alguien de confianza — no para hablar del problema, para tomar aire de la mente.',
      evidence: {
        avgStress: avgStress != null ? Math.round(avgStress * 10) / 10 : undefined,
        daysCovered: w.daysCovered,
      },
    }
  }

  // Patrón C — Deuda de sueño (2+ días de <6h).
  const sleepDebtStreak = consecutiveDaysMatching(w.sleepByDay, now, (v) => v < SLEEP_DEBT_HOURS)
  if (sleepDebtStreak >= 2) {
    return {
      kind: 'sleep_debt',
      priority: 'medium',
      title: `Deuda de sueño acumulada`,
      observation: `Llevas ${sleepDebtStreak} días durmiendo menos de ${SLEEP_DEBT_HOURS}h. Se paga en la próxima decisión difícil.`,
      suggestion: 'Cerrá pantallas 30 min antes de la hora que quieras dormir. Sin heroísmo — que se te haga fácil.',
      evidence: {
        avgSleepHours: avgSleep != null ? Math.round(avgSleep * 10) / 10 : undefined,
        daysCovered: w.daysCovered,
      },
    }
  }

  return null
}
