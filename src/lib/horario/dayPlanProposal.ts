// SIR V2 — /horario · Plan del día (Fase 2), lógica pura.
//
// Toma las tareas que vencen hoy SIN hora asignada (las de `untimedTasks` del
// DayPlan) y PROPONE meterlas en los huecos libres ya calculados
// (computeFreeGaps → GapRowItem[]), respetando la duración estimada por esfuerzo
// (S/M/L → bloque corto/medio/largo). Es una PROPUESTA: la UI la deja editar y,
// sólo al aceptar, cada tarea recibe `due_time` en su franja (cae al timeline).
// NUNCA se asigna hora en silencio.
//
// Dos capas:
//   - greedyAssign: decide EN QUÉ hueco va cada tarea (packing por orden).
//   - layoutPlan:   dado un mapa tarea→hueco (el greedy o el editado por el
//                   usuario), calcula la hora concreta de cada tarea dentro de su
//                   hueco (secuencial) y marca si se pasa del hueco (overflow).
//
// PURO + determinístico: las horas salen del reloj Lima (msToLimaHHMM), igual
// que dayPlan.ts. No toca el store; aplicar los cambios es trabajo de la UI.

import type { TaskEffort } from '@/types'
import type { CockpitTask } from './cockpit'
import type { GapRowItem } from './dayPlan'
import { msToLimaHHMM } from './limaClock'

const MIN = 60_000

/** Duración estimada por esfuerzo (camiseta): S corto, M medio, L largo. */
export const EFFORT_MINUTES: Record<TaskEffort, number> = { S: 30, M: 60, L: 120 }
/** Duración por defecto de una tarea sin esfuerzo declarado. */
export const DEFAULT_TASK_MINUTES = 30

/** Minutos estimados para una tarea (según su esfuerzo, o el default). */
export function taskMinutes(task: CockpitTask): number {
  return task.effort ? EFFORT_MINUTES[task.effort] : DEFAULT_TASK_MINUTES
}

/** Una tarea ubicada en un hueco, con su hora concreta del día. */
export interface PlanSlot {
  task: CockpitTask
  gapKey: string
  startMs: number
  endMs: number
  /** 'HH:MM' Lima — lo que se persiste como due_time al aceptar. */
  dueTime: string
  minutes: number
  /** La tarea se pasa del final del hueco (el usuario sobre-asignó). */
  overflow: boolean
}

export interface DayPlanProposal {
  /** Tareas ubicadas (en orden de día). */
  slots: PlanSlot[]
  /** Tareas que no entran en ningún hueco (sin lugar). */
  unplaced: CockpitTask[]
}

/** Mapa tarea(id) → hueco(key) | null (sin programar). */
export type PlanAssignments = Record<string, string | null>

/**
 * Decide en qué hueco va cada tarea por packing greedy: recorre las tareas en su
 * orden (ya priorizado por el cockpit) y mete cada una en el PRIMER hueco con
 * espacio suficiente para su duración, descontando la capacidad usada. La que no
 * entra en ninguno queda null (sin lugar).
 */
export function greedyAssign(tasks: CockpitTask[], gaps: GapRowItem[]): PlanAssignments {
  const remaining = gaps.map((g) => ({ key: g.key, free: g.endMs - g.startMs }))
  const out: PlanAssignments = {}
  for (const task of tasks) {
    const need = taskMinutes(task) * MIN
    const slot = remaining.find((r) => r.free >= need)
    if (slot) {
      slot.free -= need
      out[task.id] = slot.key
    } else {
      out[task.id] = null
    }
  }
  return out
}

/**
 * Dadas las asignaciones (greedy o editadas), calcula la hora concreta de cada
 * tarea: dentro de cada hueco, las tareas se ubican EN SECUENCIA desde el inicio
 * del hueco, una tras otra, según su duración. Si la suma se pasa del fin del
 * hueco, las que sobran se marcan `overflow` (no se bloquea: el usuario manda).
 * Las tareas con asignación null (o a un hueco inexistente) van a `unplaced`.
 *
 * El orden DENTRO de un hueco respeta el orden de `tasks` (prioridad del cockpit).
 */
export function layoutPlan(
  tasks: CockpitTask[],
  gaps: GapRowItem[],
  assignments: PlanAssignments,
): DayPlanProposal {
  const gapById = new Map(gaps.map((g) => [g.key, g]))
  const cursor = new Map<string, number>() // gapKey → próximo inicio libre (ms)
  const slots: PlanSlot[] = []
  const unplaced: CockpitTask[] = []

  for (const task of tasks) {
    const gapKey = assignments[task.id] ?? null
    if (!gapKey) {
      unplaced.push(task)
      continue
    }
    const gap = gapById.get(gapKey)
    if (!gap) {
      unplaced.push(task)
      continue
    }
    const startMs = cursor.get(gapKey) ?? gap.startMs
    const minutes = taskMinutes(task)
    const endMs = startMs + minutes * MIN
    cursor.set(gapKey, endMs)
    slots.push({
      task,
      gapKey,
      startMs,
      endMs,
      dueTime: msToLimaHHMM(startMs),
      minutes,
      overflow: endMs > gap.endMs,
    })
  }

  // Orden de día: por inicio, desempate por título (estable).
  slots.sort((a, b) => a.startMs - b.startMs || a.task.title.localeCompare(b.task.title, 'es'))
  return { slots, unplaced }
}

/**
 * Propuesta inicial: greedy + layout. Atajo para la primera pantalla; después la
 * UI re-corre `layoutPlan` con las asignaciones que el usuario haya editado.
 */
export function proposeDayPlan(tasks: CockpitTask[], gaps: GapRowItem[]): DayPlanProposal {
  return layoutPlan(tasks, gaps, greedyAssign(tasks, gaps))
}
