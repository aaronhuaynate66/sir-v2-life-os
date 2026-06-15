// SIR V2 — Objective Step Store (migración 0040)
// Pasos/hitos accionables por objetivo, con Zustand + persist + Supabase sync.
//
// Store separado del de objetivos a propósito: una slice independiente con su
// propia tabla (objective_steps) y su propio engine de sync. La FK
// objective_steps.objective_id → goals.id vive en dos stores distintos; en el
// caso normal el objetivo YA existe en DB cuando se agregan/generan pasos
// (los pasos se crean para un objetivo existente), así que la FK se satisface.
// Si por carrera un paso se pushea antes que su objetivo, la FK lo rechaza y el
// engine reintenta (1s/4s/16s) cuando el objetivo aterriza — mismo patrón
// resiliente que relationships → people.
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ObjectiveStep, ObjectiveStepStatus, TaskStatus } from '@/types'
import { STORAGE_KEYS } from './storage'
import { attachSupabaseSync, objectiveStepAdapter } from '@/lib/supabase/sync'
import { taskStatusPatch } from '@/lib/objectives/steps'
import { track, EVENTS } from '@/lib/analytics/track'

/** Stamp de fecha real de completado (migración 0070): al pasar a 'hecho' setea
 *  completedAt=now (si no lo tenía); al salir de 'hecho' lo limpia. Centraliza
 *  la lógica para los 3 setters de status. Idempotente. */
function completedStamp(prev: ObjectiveStep, nextStatus: ObjectiveStepStatus): Partial<ObjectiveStep> {
  if (nextStatus === 'hecho') return prev.completedAt ? {} : { completedAt: new Date().toISOString() }
  return prev.completedAt ? { completedAt: undefined } : {}
}

interface ObjectiveStepState {
  steps: ObjectiveStep[]
}

interface ObjectiveStepActions {
  /** Inserta un paso. */
  addStep: (step: ObjectiveStep) => void
  /** Inserta varios pasos de una (aceptar un plan generado por IA). */
  addSteps: (steps: ObjectiveStep[]) => void
  updateStep: (id: string, patch: Partial<ObjectiveStep>) => void
  /** Estado legado (3 valores). Lo usan los KRs (su ciclo pendiente→…→hecho). */
  setStepStatus: (id: string, status: ObjectiveStepStatus) => void
  /**
   * Estado de workflow de TAREA (4 valores): persiste `taskStatus` Y sincroniza
   * el `status` legado para que el rollup del KR siga contando 'done' como hecho.
   */
  setTaskStatus: (id: string, taskStatus: TaskStatus) => void
  removeStep: (id: string) => void
  /** Aplica un set de cambios de `order` (reordenar). */
  applyOrderChanges: (changed: ObjectiveStep[]) => void
  clearAll: () => void
}

export type ObjectiveStepStore = ObjectiveStepState & ObjectiveStepActions

// Sin fixtures: los pasos son data 100% real del usuario.
const INITIAL_STATE: ObjectiveStepState = { steps: [] }

export const useObjectiveStepStore = create<ObjectiveStepStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      addStep: (step) => set((s) => ({ steps: [...s.steps, step] })),

      addSteps: (steps) => set((s) => ({ steps: [...s.steps, ...steps] })),

      updateStep: (id, patch) =>
        set((s) => ({
          steps: s.steps.map((st) =>
            st.id === id
              ? { ...st, ...patch, ...(patch.status !== undefined ? completedStamp(st, patch.status) : {}) }
              : st,
          ),
        })),

      setStepStatus: (id, status) =>
        set((s) => {
          const prev = s.steps.find((st) => st.id === id)
          if (status === 'hecho' && prev && prev.status !== 'hecho') track(EVENTS.stepCompleted, { from: 'step' })
          return {
            steps: s.steps.map((st) => (st.id === id ? { ...st, status, ...completedStamp(st, status) } : st)),
          }
        }),

      setTaskStatus: (id, taskStatus) =>
        set((s) => {
          const patch = taskStatusPatch(taskStatus)
          const prev = s.steps.find((st) => st.id === id)
          if (patch.status === 'hecho' && prev && prev.status !== 'hecho') track(EVENTS.stepCompleted, { from: 'task' })
          return {
            steps: s.steps.map((st) =>
              st.id === id ? { ...st, ...patch, ...completedStamp(st, patch.status) } : st,
            ),
          }
        }),

      removeStep: (id) => set((s) => ({ steps: s.steps.filter((st) => st.id !== id) })),

      applyOrderChanges: (changed) =>
        set((s) => {
          if (changed.length === 0) return s
          const byId = new Map(changed.map((c) => [c.id, c.order]))
          return {
            steps: s.steps.map((st) =>
              byId.has(st.id) ? { ...st, order: byId.get(st.id)! } : st,
            ),
          }
        }),

      clearAll: () => set({ steps: [] }),
    }),
    {
      name: STORAGE_KEYS.OBJECTIVE_STEP,
    },
  ),
)

attachSupabaseSync({
  store: useObjectiveStepStore,
  bindings: [
    {
      label: 'objective_steps',
      select: (s) => s.steps,
      apply: (items) => useObjectiveStepStore.setState({ steps: items }),
      adapter: objectiveStepAdapter,
    },
  ],
})
