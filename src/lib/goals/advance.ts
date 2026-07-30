// SIR V2 — AVANCE REAL de un objetivo, derivado de sus PASOS (objective_steps).
//
// POR QUÉ EXISTE (hallazgo 26-jul-2026, medido contra la base):
// el avance de los objetivos se leía de dos lugares que no lo tienen.
//
//   1. `goals.milestones` (columna JSON) está MUERTA: en todo el código nadie
//      marca nunca un hito como completado — `Milestone.completedAt` no se setea
//      en ningún sitio fuera de los fixtures, y no hay UI para cerrarlo. Aun así
//      `computeNorteDrift` medía el avance del norte con esos `completedAt` →
//      siempre `undefined` → el norte se veía "estancado" hicieras lo que hicieras.
//
//   2. `goals.progress` (escalar) SÍ sale del rollup de pasos… pero solo como
//      efecto secundario de tener `/objetivos` montada en el navegador
//      (app/objetivos/page.tsx la recalcula y la persiste). No hay job de
//      servidor que la mantenga → el brief matutino anunciaba "vas 0%" sobre
//      objetivos con 20 pasos reales debajo.
//
// Mientras tanto el trabajo de verdad vive en `objective_steps` (151 filas en 7
// de los 10 objetivos, al 26-jul). Este módulo calcula el avance desde esa única
// estructura y es PURO → lo pueden usar el cron, la UI y el chat sin divergir.
//
// PURO: cero red, cero IA, cero Date.now() implícito (el "hoy" se inyecta).

import type { ObjectiveStep } from '@/types'
import {
  computeObjectiveProgress,
  computeStepProgress,
  keyResultsForObjective,
  stepsForObjective,
} from '@/lib/objectives/steps'

export interface GoalAdvance {
  goalId: string
  /**
   * Porcentaje derivado de los pasos, 0..100. `null` cuando el objetivo NO tiene
   * ningún paso — ahí no hay nada que medir y el caller debe caer al progreso
   * manual (`goals.progress`) en vez de inventar un 0.
   */
  percent: number | null
  /** Pasos cerrados y total considerados para el porcentaje. */
  done: number
  total: number
  /** ISO del paso cerrado MÁS RECIENTE. `null` si no cerró ninguno todavía. */
  lastAdvanceISO: string | null
  /** Pasos con fecha pasada que siguen sin cerrarse. */
  overdue: number
  /** Total de pasos del objetivo (KRs + tareas), cerrados o no. */
  stepCount: number
}

const DONE: ObjectiveStep['status'] = 'hecho'

function isDone(s: ObjectiveStep): boolean {
  return s.status === DONE
}

/** ISO más reciente de una lista (ignora vacíos/inválidos). */
function mostRecentISO(isos: Array<string | null | undefined>): string | null {
  let best: string | null = null
  let bestT = -Infinity
  for (const iso of isos) {
    if (!iso) continue
    const t = Date.parse(iso)
    if (Number.isFinite(t) && t > bestT) {
      bestT = t
      best = iso
    }
  }
  return best
}

/**
 * Avance de UN objetivo a partir de la lista de pasos (puede ser todo el store:
 * filtra por `objectiveId`).
 *
 * El porcentaje respeta el modelo OKR cuando existe (rollup de KRs vía
 * `computeObjectiveProgress`, que ya pondera métricas y tareas hijas). Si el
 * objetivo tiene pasos pero NINGÚN KR — data vieja o planes cargados como lista
 * plana — cae a un rollup plano hechos/total en vez de devolver `null`, que era
 * lo que dejaba invisibles esos objetivos.
 *
 * @param today Fecha local 'YYYY-MM-DD' para juzgar vencimiento. Comparación
 *   lexicográfica: los `targetDate` son date-only ISO, así que ordena bien.
 */
export function computeGoalAdvance(
  steps: ObjectiveStep[],
  goalId: string,
  today: string,
): GoalAdvance {
  // Los DESCARTADOS salen del cálculo entero, no solo del numerador: un paso que
  // ya no es parte del plan no debe engordar el denominador ni contarse como
  // vencido. Si contaran, cerrar un trato caído dejaría el objetivo en "0 de 20"
  // para siempre; si contaran como hechos, lo dejaría en 100% de algo que nunca
  // pasó. Ninguna de las dos es verdad. Se filtra sobre TODA la lista porque el
  // rollup OKR vuelve a filtrar por su cuenta más adentro.
  const vivos = steps.filter((s) => s.status !== 'descartado')
  const own = stepsForObjective(vivos, goalId)

  if (own.length === 0) {
    return { goalId, percent: null, done: 0, total: 0, lastAdvanceISO: null, overdue: 0, stepCount: 0 }
  }

  // Rollup OKR si hay KRs; si no, rollup plano sobre todos los pasos.
  const okr = keyResultsForObjective(vivos, goalId).length > 0
    ? computeObjectiveProgress(vivos, goalId)
    : null
  const rollup = okr ?? computeStepProgress(own)

  const overdue = own.filter((s) => !isDone(s) && !!s.targetDate && s.targetDate < today).length

  return {
    goalId,
    percent: rollup ? rollup.percent : null,
    done: rollup ? rollup.done : 0,
    total: rollup ? rollup.total : 0,
    lastAdvanceISO: mostRecentISO(own.filter(isDone).map((s) => s.completedAt)),
    overdue,
    stepCount: own.length,
  }
}

/** Avance de varios objetivos de una pasada. Clave = goalId. */
export function goalAdvanceMap(
  steps: ObjectiveStep[],
  goalIds: string[],
  today: string,
): Map<string, GoalAdvance> {
  const out = new Map<string, GoalAdvance>()
  for (const id of goalIds) out.set(id, computeGoalAdvance(steps, id, today))
  return out
}

/**
 * Porcentaje que se le debe MOSTRAR al usuario: el real de los pasos cuando el
 * objetivo tiene plan, el manual cuando no lo tiene. Nunca inventa un 0 por
 * ausencia de datos — esa era exactamente la mentira del "vas 0%".
 */
export function effectiveGoalProgress(
  advance: GoalAdvance | undefined,
  manualProgress: number | null | undefined,
): number {
  if (advance && advance.percent !== null) return advance.percent
  return typeof manualProgress === 'number' && Number.isFinite(manualProgress) ? manualProgress : 0
}

/**
 * "Último movimiento" de un objetivo: lo más reciente entre la edición del
 * propio objetivo y el cierre de alguno de sus pasos. Es lo que deben mirar los
 * detectores de estancamiento — hoy solo miran `updatedAt`, así que cerrar diez
 * pasos no des-estanca nada.
 */
export function lastMovementISO(
  advance: GoalAdvance | undefined,
  goalUpdatedAt: string | null | undefined,
): string | null {
  return mostRecentISO([goalUpdatedAt, advance?.lastAdvanceISO ?? null])
}
