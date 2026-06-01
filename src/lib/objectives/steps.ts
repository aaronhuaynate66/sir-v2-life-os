// SIR V2 — Lógica pura de pasos de objetivo (rollup, orden, próximo paso).
//
// PURO + determinístico: cero deps, cero red, cero LLM. Toda la matemática del
// progreso por pasos y el reordenamiento vive acá → testeable y reusable por
// la UI de /objetivos y por la agenda "Próximo".
//
// Contrato del orden: los pasos se ordenan por `order` ascendente, con
// desempate estable por `createdAt` y luego `id` (dos pasos con el mismo
// `order` — ej. importados por IA — quedan en orden determinístico).

import type { ObjectiveStep } from '@/types'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

/** Rollup de progreso de un objetivo a partir de sus pasos. */
export interface StepProgress {
  done: number
  total: number
  /** 0..100, redondeado. */
  percent: number
}

/** Copia ordenada de los pasos (no muta el input). */
export function sortSteps(steps: ObjectiveStep[]): ObjectiveStep[] {
  return [...steps].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/** Pasos de UN objetivo, ya ordenados. */
export function stepsForObjective(
  steps: ObjectiveStep[],
  objectiveId: string,
): ObjectiveStep[] {
  return sortSteps(steps.filter((s) => s.objectiveId === objectiveId))
}

/**
 * Progreso rollup: hechos / total. Devuelve null si no hay pasos (el caller
 * cae al comportamiento actual: progreso manual del objetivo).
 */
export function computeStepProgress(steps: ObjectiveStep[]): StepProgress | null {
  if (steps.length === 0) return null
  const done = steps.filter((s) => s.status === 'hecho').length
  return { done, total: steps.length, percent: Math.round((done / steps.length) * 100) }
}

/**
 * Próximo paso accionable de un objetivo: el primero NO 'hecho' por orden.
 * Es el "qué hacer ahora" que la agenda surfacéa. null si no hay pasos
 * pendientes (todo hecho, o sin pasos).
 */
export function nextPendingStep(steps: ObjectiveStep[]): ObjectiveStep | null {
  const ordered = sortSteps(steps)
  return ordered.find((s) => s.status !== 'hecho') ?? null
}

/**
 * Reasigna `order` de forma densa 0..n-1 respetando el orden actual. Útil tras
 * borrar/insertar para evitar huecos o colisiones. Devuelve solo los pasos que
 * cambiaron de `order` (para minimizar upserts).
 */
export function normalizeOrders(steps: ObjectiveStep[]): ObjectiveStep[] {
  const ordered = sortSteps(steps)
  const changed: ObjectiveStep[] = []
  ordered.forEach((s, i) => {
    if (s.order !== i) changed.push({ ...s, order: i })
  })
  return changed
}

/**
 * Mueve un paso una posición arriba ('up') o abajo ('down') dentro de su
 * objetivo, intercambiando `order` con el vecino. Devuelve los DOS pasos cuyo
 * `order` cambió (para upsert), o [] si el movimiento no aplica (extremos /
 * id inexistente). No muta el input.
 */
export function moveStep(
  steps: ObjectiveStep[],
  id: string,
  dir: 'up' | 'down',
): ObjectiveStep[] {
  const ordered = sortSteps(steps)
  const idx = ordered.findIndex((s) => s.id === id)
  if (idx === -1) return []
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= ordered.length) return []
  const a = ordered[idx]
  const b = ordered[swapIdx]
  // Intercambio de orden. Si por data vieja tienen el mismo `order`, forzamos
  // una diferencia determinística usando los índices densos.
  const aOrder = a.order === b.order ? swapIdx : b.order
  const bOrder = a.order === b.order ? idx : a.order
  return [
    { ...a, order: aOrder },
    { ...b, order: bOrder },
  ]
}

/** Días (con signo) hasta la fecha de un paso. null si no tiene fecha. */
export function daysUntilStep(step: ObjectiveStep, now: Date): number | null {
  const d = parseLocalDate(step.targetDate)
  if (!d) return null
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((d.getTime() - todayStart.getTime()) / 86_400_000)
}
