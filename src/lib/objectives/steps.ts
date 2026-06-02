// SIR V2 — Lógica pura del plan OKR de un objetivo (jerarquía, rollup, orden).
//
// PURO + determinístico: cero deps, cero red, cero LLM. Toda la matemática del
// modelo OKR (Objetivo → Resultados Clave → Tareas) vive acá → testeable y
// reusable por la UI de /objetivos y por la agenda "Próximo".
//
// Jerarquía (migración 0041): cada ObjectiveStep es un KR (kind='key_result',
// parentId undefined) o una tarea (kind='task', parentId = KR.id). Ambos llevan
// objectiveId = Goal.id. El progreso del KR = rollup de sus tareas; el del
// objetivo = rollup de sus KRs.
//
// Contrato del orden: dentro de un grupo de hermanos (KRs entre sí; tareas de un
// mismo KR) se ordena por `order` ascendente, con desempate estable por
// `createdAt` y luego `id` (dos nodos con el mismo `order` — ej. importados por
// IA — quedan en orden determinístico).

import type { ObjectiveStep } from '@/types'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

/** ¿Es un Resultado Clave? (KR explícito o data pre-0041 sin `kind`). */
export function isKeyResult(s: ObjectiveStep): boolean {
  return s.kind !== 'task'
}

/** ¿Es una tarea (hoja accionable bajo un KR)? */
export function isTask(s: ObjectiveStep): boolean {
  return s.kind === 'task'
}

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

/** TODOS los nodos (KRs + tareas) de UN objetivo, ya ordenados. */
export function stepsForObjective(
  steps: ObjectiveStep[],
  objectiveId: string,
): ObjectiveStep[] {
  return sortSteps(steps.filter((s) => s.objectiveId === objectiveId))
}

/** Resultados Clave de un objetivo (KRs, parentId null), ordenados. */
export function keyResultsForObjective(
  steps: ObjectiveStep[],
  objectiveId: string,
): ObjectiveStep[] {
  return sortSteps(
    steps.filter((s) => s.objectiveId === objectiveId && isKeyResult(s)),
  )
}

/** Tareas que cuelgan de un KR (parentId = krId), ordenadas. */
export function tasksForKeyResult(
  steps: ObjectiveStep[],
  krId: string,
): ObjectiveStep[] {
  return sortSteps(steps.filter((s) => isTask(s) && s.parentId === krId))
}

/**
 * Progreso rollup genérico por status: hechos / total de una lista plana.
 * Devuelve null si la lista está vacía. Base reusada por el rollup de tareas
 * de un KR.
 */
export function computeStepProgress(steps: ObjectiveStep[]): StepProgress | null {
  if (steps.length === 0) return null
  const done = steps.filter((s) => s.status === 'hecho').length
  return { done, total: steps.length, percent: Math.round((done / steps.length) * 100) }
}

/**
 * Progreso de un KR = rollup de sus tareas (hechas/total). Un KR SIN tareas se
 * juzga por su propio status: 'hecho' → 100% (1/1), si no → 0% (0/1). Así un KR
 * sin descomponer sigue aportando al objetivo.
 */
export function computeKeyResultProgress(
  tasks: ObjectiveStep[],
  kr: ObjectiveStep,
): StepProgress {
  const rollup = computeStepProgress(tasks)
  if (rollup) return rollup
  const done = kr.status === 'hecho' ? 1 : 0
  return { done, total: 1, percent: done * 100 }
}

/**
 * Progreso del objetivo = rollup de sus KRs. `done`/`total` cuentan KRs
 * completados (al 100%) / total de KRs; `percent` es el promedio de los
 * porcentajes de cada KR (granular: refleja avance parcial dentro de cada KR).
 * Devuelve null si el objetivo no tiene KRs (el caller cae a progreso manual).
 */
export function computeObjectiveProgress(
  steps: ObjectiveStep[],
  objectiveId: string,
): StepProgress | null {
  const krs = keyResultsForObjective(steps, objectiveId)
  if (krs.length === 0) return null
  let sumPercent = 0
  let done = 0
  for (const kr of krs) {
    const p = computeKeyResultProgress(tasksForKeyResult(steps, kr.id), kr)
    sumPercent += p.percent
    if (p.percent === 100) done += 1
  }
  return { done, total: krs.length, percent: Math.round(sumPercent / krs.length) }
}

/**
 * Próximo paso accionable de UN objetivo, recorriendo el árbol OKR: el primer
 * KR no-completo (por orden), y dentro de él su primera tarea no-'hecho'. Si el
 * KR no tiene tareas, el KR mismo es la hoja accionable. Devuelve la HOJA (la
 * tarea, o el KR sin tareas) — el "qué hacer AHORA" que la agenda surfacéa.
 * null si todo está hecho o no hay KRs.
 *
 * `steps` puede ser todo el store o sólo los nodos del objetivo: filtra por la
 * jerarquía (parentId), no por objectiveId, así que pasar los del objetivo basta.
 */
export function nextPendingLeaf(steps: ObjectiveStep[]): ObjectiveStep | null {
  const krs = sortSteps(steps.filter(isKeyResult))
  for (const kr of krs) {
    const tasks = tasksForKeyResult(steps, kr.id)
    if (tasks.length === 0) {
      if (kr.status !== 'hecho') return kr // KR sin tareas → es la hoja.
      continue
    }
    const pendingTask = tasks.find((t) => t.status !== 'hecho')
    if (pendingTask) return pendingTask
    // Todas las tareas del KR hechas → KR completo, seguimos al próximo KR.
  }
  return null
}

/**
 * @deprecated Pre-OKR (0040): primer nodo no-'hecho' por orden de una lista
 * plana. Reemplazado por nextPendingLeaf (recorre la jerarquía KR→tarea). Se
 * mantiene por compatibilidad; preferí nextPendingLeaf en código nuevo.
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
