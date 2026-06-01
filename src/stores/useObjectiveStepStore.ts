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
import type { ObjectiveStep, ObjectiveStepStatus } from '@/types'
import { STORAGE_KEYS } from './storage'
import { attachSupabaseSync, objectiveStepAdapter } from '@/lib/supabase/sync'

interface ObjectiveStepState {
  steps: ObjectiveStep[]
}

interface ObjectiveStepActions {
  /** Inserta un paso. */
  addStep: (step: ObjectiveStep) => void
  /** Inserta varios pasos de una (aceptar un plan generado por IA). */
  addSteps: (steps: ObjectiveStep[]) => void
  updateStep: (id: string, patch: Partial<ObjectiveStep>) => void
  setStepStatus: (id: string, status: ObjectiveStepStatus) => void
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
          steps: s.steps.map((st) => (st.id === id ? { ...st, ...patch } : st)),
        })),

      setStepStatus: (id, status) =>
        set((s) => ({
          steps: s.steps.map((st) => (st.id === id ? { ...st, status } : st)),
        })),

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
