// SIR V2 — Recovery Mode dinámico (P4)
//
// Convierte el banner estático de "recovery" en una evaluación accionable:
// detecta señales de SOBRECARGA y decide si el modo recuperación debe
// activarse y con qué intensidad, junto con prioridades concretas.
//
// Determinístico y sin red. Toma señales numéricas ya disponibles (weekly
// score, promedios de la ventana de 7d, share de gasto no-esencial) — no
// re-deriva datos crudos. `null` = sin datos → ese trigger no dispara
// (no inventamos sobrecarga por falta de registro).
//
// ── UMBRALES (documentados) ──────────────────────────────────────────
//   · bad_sleep      : sueño promedio (7d) < 6 h
//   · high_stress    : estrés promedio (7d) ≥ 7 / 10
//   · low_energy     : energía promedio (7d) ≤ 3 / 10
//   · weak_week      : weekly tier == 'D' (score < 50)
//   · impulsive_spend: gasto no-esencial > 40% del gasto clasificado
//
// ── SEVERIDAD ────────────────────────────────────────────────────────
//   · none : 0 triggers
//   · soft : 1-2 triggers  → banner + tarjeta de prioridades (UI normal)
//   · hard : ≥3 triggers  Ó  weak_week  → la UI se SIMPLIFICA (oculta forms
//            y listas secundarias) y prioriza recuperación.

import type { WeeklyTier } from '@/engines/weekly'

export type RecoveryTrigger = 'bad_sleep' | 'high_stress' | 'low_energy' | 'weak_week' | 'impulsive_spend'
export type RecoverySeverity = 'none' | 'soft' | 'hard'

export interface RecoveryInput {
  weeklyTier: WeeklyTier
  /** Promedio de sueño 7d (h). null = sin datos. */
  avgSleepHours: number | null
  /** Promedio de estrés 7d (1-10). null = sin datos. */
  avgStress: number | null
  /** Promedio de energía 7d (1-10). null = sin datos. */
  avgEnergy: number | null
  /** % de gasto no-esencial sobre el clasificado (0-100). null = sin datos. */
  nonEssentialShare: number | null
}

export interface RecoveryAssessment {
  active: boolean
  severity: RecoverySeverity
  triggers: RecoveryTrigger[]
  /** Razones legibles, una por trigger disparado. */
  reasons: string[]
  /** Acciones priorizadas (las más relevantes primero). */
  priorities: string[]
}

// Umbrales (constantes nombradas para que el test y la doc no se desincronicen).
export const RECOVERY_THRESHOLDS = {
  sleepHoursMin: 6,
  stressMax: 7,
  energyMin: 3,
  nonEssentialSharePct: 40,
} as const

const REASON: Record<RecoveryTrigger, string> = {
  bad_sleep: 'Dormiste poco esta semana (menos de 6 h promedio).',
  high_stress: 'Tu estrés viene alto (7+/10).',
  low_energy: 'Tu energía está muy baja (3 o menos).',
  weak_week: 'La semana viene floja (score en D).',
  impulsive_spend: 'El gasto no-esencial se disparó (más del 40%).',
}

// Prioridad de acción por trigger (orden de impacto en recuperación).
const PRIORITY: Record<RecoveryTrigger, string> = {
  bad_sleep: 'Dormí 7-8 h hoy: es la palanca #1 de recuperación.',
  low_energy: 'Movimiento suave + comida real antes que cafeína.',
  high_stress: 'Elegí UNA sola cosa importante hoy y soltá el resto.',
  impulsive_spend: 'Pausá compras no-esenciales 48 h (regla de las 48 h).',
  weak_week: 'Bajá la vara: metas mínimas esta semana, sin culpa.',
}

// Orden canónico para presentar prioridades.
const PRIORITY_ORDER: RecoveryTrigger[] = ['bad_sleep', 'low_energy', 'high_stress', 'impulsive_spend', 'weak_week']

export function assessRecovery(input: RecoveryInput): RecoveryAssessment {
  const t = RECOVERY_THRESHOLDS
  const triggers: RecoveryTrigger[] = []

  if (input.avgSleepHours != null && input.avgSleepHours < t.sleepHoursMin) triggers.push('bad_sleep')
  if (input.avgStress != null && input.avgStress >= t.stressMax) triggers.push('high_stress')
  if (input.avgEnergy != null && input.avgEnergy <= t.energyMin) triggers.push('low_energy')
  if (input.weeklyTier === 'D') triggers.push('weak_week')
  if (input.nonEssentialShare != null && input.nonEssentialShare > t.nonEssentialSharePct) triggers.push('impulsive_spend')

  const weakWeek = triggers.includes('weak_week')
  let severity: RecoverySeverity = 'none'
  if (triggers.length === 0) severity = 'none'
  else if (weakWeek || triggers.length >= 3) severity = 'hard'
  else severity = 'soft'

  const reasons = triggers.map((tr) => REASON[tr])
  const priorities = PRIORITY_ORDER.filter((tr) => triggers.includes(tr)).map((tr) => PRIORITY[tr])
  if (severity !== 'none') priorities.push('Un paso a la vez. Esto pasa.')

  return { active: severity !== 'none', severity, triggers, reasons, priorities }
}
