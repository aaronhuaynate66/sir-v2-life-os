// SIR V2 — WeekInFocus (Mission Control): selección y cómputo del objetivo
// más urgente a mostrar en la parte de arriba de /panel.
//
// Propósito: cuando hay un objetivo con targetDate en los próximos ~14 días,
// SIR debe empujarlo al frente. No es un widget más — es el ancla operativa
// de la semana ("esta semana lo que importa es X, quedan Y días"). El caso
// que motivó esto: mudanza a casa de tía Marita el sábado 4 jul 2026 —
// SIR tiene la data (goal + KRs) pero no la exponía como cockpit.
//
// Toda la lógica acá es PURA y testeable — el componente que la consume
// (WeekInFocusCard) es tonto y solo renderiza el resultado.

import type { Goal, ObjectiveStep } from '@/types'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

export interface WeekFocus {
  goal: Goal
  /** Días hasta targetDate. Negativo si ya pasó (goal vencido pero abierto). */
  daysUntil: number
  /** ISO YYYY-MM-DD del target. */
  targetDate: string
  /** KRs del goal (kind='key_result'), ordenados por `order`. */
  krs: KrRow[]
  /** Progreso agregado (KRs hechos / total). Para el chip "3/4". */
  krProgress: { done: number; total: number }
  /** true si el goal es el ancla del año (isAnchor) — el chip cambia. */
  isAnchor: boolean
}

export interface KrRow {
  id: string
  title: string
  done: boolean
}

/**
 * Devuelve el goal a destacar en el cockpit semanal, o null si no hay uno
 * cerca. Prioridades:
 *   1. Goal activo con targetDate DENTRO de la ventana (próximos N días).
 *   2. Entre los que califican, el que tiene targetDate MÁS PRÓXIMO gana.
 *   3. Si dos empatan, prioridad alta > media > baja; y el ancla del año
 *      empata al primer lugar (para forzar el norte cuando también está cerca).
 *
 * Ignora completed/paused. Un goal ya vencido (daysUntil < 0) pero aún activo
 * TAMBIÉN se considera hasta 7 días después del target — la semana no termina
 * el día del hito, y ocultarlo apenas pasa el vencimiento es demasiado brusco.
 */
export function pickWeekFocusGoal(
  goals: Goal[],
  now: Date,
  windowDays = 14,
): Goal | null {
  const nowMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const winFwd = nowMs + windowDays * 86_400_000
  const winBack = nowMs - 7 * 86_400_000

  type Cand = { goal: Goal; ms: number }
  const candidates: Cand[] = []

  for (const g of goals) {
    if (g.status !== 'active') continue
    const td = g.targetDate
    if (!td) continue
    const d = parseLocalDate(td)
    if (!d) continue
    const ms = d.getTime()
    if (ms > winFwd || ms < winBack) continue
    candidates.push({ goal: g, ms })
  }

  if (candidates.length === 0) return null

  // Sort: más urgente (menor ms) primero, tie-break por prioridad y ancla.
  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  candidates.sort((a, b) => {
    if (a.ms !== b.ms) return a.ms - b.ms
    const aAnc = a.goal.isAnchor ? 0 : 1
    const bAnc = b.goal.isAnchor ? 0 : 1
    if (aAnc !== bAnc) return aAnc - bAnc
    const ap = priorityRank[a.goal.priority] ?? 3
    const bp = priorityRank[b.goal.priority] ?? 3
    return ap - bp
  })

  return candidates[0].goal
}

/**
 * Construye el WeekFocus renderable desde el goal seleccionado + todos los
 * ObjectiveStep del store (los KRs se filtran por objectiveId + kind).
 */
export function buildWeekFocus(
  goal: Goal,
  steps: ObjectiveStep[],
  now: Date,
): WeekFocus {
  const td = goal.targetDate
  if (!td) throw new Error('buildWeekFocus: goal sin targetDate no debería llegar acá')

  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const targetMs = parseLocalDate(td)?.getTime() ?? nowDay
  const daysUntil = Math.round((targetMs - nowDay) / 86_400_000)

  const krs: KrRow[] = steps
    .filter((s) => s.objectiveId === goal.id && s.kind === 'key_result')
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ id: s.id, title: s.title, done: s.status === 'hecho' }))

  const done = krs.filter((r) => r.done).length

  return {
    goal,
    daysUntil,
    targetDate: td,
    krs,
    krProgress: { done, total: krs.length },
    isAnchor: !!goal.isAnchor,
  }
}

/**
 * Copy corto para el countdown ("HOY", "MAÑANA", "EN 3 DÍAS", "HACE 2 DÍAS").
 * Puro y determinístico — usado por el componente para renderizar.
 */
export function countdownLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'HOY'
  if (daysUntil === 1) return 'MAÑANA'
  if (daysUntil === -1) return 'AYER'
  if (daysUntil > 0) return `EN ${daysUntil} DÍAS`
  return `HACE ${Math.abs(daysUntil)} DÍAS`
}
