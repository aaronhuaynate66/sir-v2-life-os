// SIR V2 — Detección de objetivos ESTANCADOS (PURO, testeable).
//
// Hallazgo de la auditoría de proactividad: SIR sabe cuándo un objetivo lleva
// mucho sin moverse (norteDrift/coherence) pero solo lo OBSERVA en paneles. El
// loop cerrado es una DECISIÓN: retomar / repriorizar / soltar. Este helper
// detecta los candidatos; la UI ofrece las 3 salidas.

import type { Goal } from '@/types'

/** Días sin tocar un objetivo para considerarlo estancado. Alineado con el
 *  nudge del push (goalNudge, 14d) y más laxo que norteDrift (panel). */
export const STALL_DAYS = 14

export interface StalledGoal {
  goal: Goal
  daysSinceTouch: number
}

function daysSince(iso: string, now: Date): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return Math.floor((now.getTime() - t) / 86_400_000)
}

/**
 * Objetivos ACTIVOS que no se tocan hace ≥ minDays, ordenados por más estancado
 * primero (y el norte primero a igualdad, que pesa más). Excluye los completados
 * de facto (progress ≥ 100). PURO.
 */
export function stalledGoals(goals: Goal[], now: Date = new Date(), minDays: number = STALL_DAYS): StalledGoal[] {
  return goals
    .filter((g) => g.status === 'active' && (g.progress ?? 0) < 100)
    .map((g) => ({ goal: g, daysSinceTouch: daysSince(g.updatedAt, now) }))
    .filter((s) => s.daysSinceTouch >= minDays)
    .sort((a, b) => {
      // El norte estancado va primero; luego por más días sin tocar.
      if (!!a.goal.isAnchor !== !!b.goal.isAnchor) return a.goal.isAnchor ? -1 : 1
      return b.daysSinceTouch - a.daysSinceTouch
    })
}
