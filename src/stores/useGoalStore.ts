// SIR V2 — Goal Store
// Manages goals with Zustand + persist + Supabase sync (Sesion 20c)
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Goal } from '@/types'
import { fixtureGoals } from '@/data/fixtures'
import { SEED_FIXTURES, purgeFixtureRows } from '@/data/fixtures/seed'
import { STORAGE_KEYS } from './storage'
import { attachSupabaseSync, goalAdapter } from '@/lib/supabase/sync'

interface GoalState {
  goals: Goal[]
}

interface GoalActions {
  addGoal: (goal: Goal) => void
  updateGoal: (id: string, patch: Partial<Goal>) => void
  removeGoal: (id: string) => void
  updateGoalProgress: (id: string, progress: number) => void
  completeGoal: (id: string) => void
  pauseGoal: (id: string) => void
  /** Marca un objetivo como ancla del año (o lo desmarca si on=false).
   *  Invariante: solo un ancla a la vez — marcar uno desmarca el resto. */
  setAnchor: (id: string, on: boolean) => void
  resetToFixtures: () => void
  clearAll: () => void
}

export type GoalStore = GoalState & GoalActions

const INITIAL_STATE: GoalState = SEED_FIXTURES ? { goals: fixtureGoals } : { goals: [] }

export const useGoalStore = create<GoalStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      addGoal: (goal) =>
        set((s) => ({ goals: [...s.goals, goal] })),

      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: new Date().toISOString() } : g)),
        })),

      removeGoal: (id) =>
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      updateGoalProgress: (id, progress) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === id ? { ...g, progress, updatedAt: new Date().toISOString() } : g
          ),
        })),

      completeGoal: (id) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === id ? { ...g, status: 'completed', progress: 100, updatedAt: new Date().toISOString() } : g
          ),
        })),

      pauseGoal: (id) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === id ? { ...g, status: 'paused', updatedAt: new Date().toISOString() } : g
          ),
        })),

      setAnchor: (id, on) =>
        set((s) => {
          const now = new Date().toISOString()
          return {
            goals: s.goals.map((g) => {
              if (g.id === id) {
                if (g.isAnchor === on) return g
                return { ...g, isAnchor: on, updatedAt: now }
              }
              // Desmarcar cualquier otro ancla al encender uno (un ancla a la vez).
              if (on && g.isAnchor) return { ...g, isAnchor: false, updatedAt: now }
              return g
            }),
          }
        }),

      resetToFixtures: () => set(INITIAL_STATE),

      clearAll: () => set({ goals: [] }),
    }),
    {
      name: STORAGE_KEYS.GOAL,
      // v1: purga goals sembrados (goal_001/002) de clientes viejos.
      version: 1,
      migrate: (state) => {
        if (!state || typeof state !== 'object') return state
        const s = state as Partial<GoalState>
        return { ...(state as object), goals: purgeFixtureRows(s.goals) } as GoalState
      },
    }
  )
)

attachSupabaseSync({
  store: useGoalStore,
  bindings: [
    {
      label: 'goals',
      select: (s) => s.goals,
      apply: (items) => useGoalStore.setState({ goals: items }),
      adapter: goalAdapter,
    },
  ],
})
