// SIR V2 — Finance Store
// Manages financialMovements with Zustand + persist + Supabase sync (Sesion 20c)
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FinancialMovement } from '@/types'
import { fixtureFinancialMovements } from '@/data/fixtures'
import { STORAGE_KEYS } from './storage'
import { attachSupabaseSync, financeMovementAdapter } from '@/lib/supabase/sync'

interface FinanceState {
  financialMovements: FinancialMovement[]
}

interface FinanceActions {
  addFinancialMovement: (movement: FinancialMovement) => void
  updateFinancialMovement: (id: string, patch: Partial<FinancialMovement>) => void
  removeFinancialMovement: (id: string) => void
  resetToFixtures: () => void
  clearAll: () => void
}

export type FinanceStore = FinanceState & FinanceActions

const INITIAL_STATE: FinanceState = {
  financialMovements: fixtureFinancialMovements,
}

export const useFinanceStore = create<FinanceStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      addFinancialMovement: (movement) =>
        set((s) => ({ financialMovements: [...s.financialMovements, movement] })),

      updateFinancialMovement: (id, patch) =>
        set((s) => ({
          financialMovements: s.financialMovements.map((m) =>
            m.id === id ? { ...m, ...patch } : m
          ),
        })),

      removeFinancialMovement: (id) =>
        set((s) => ({
          financialMovements: s.financialMovements.filter((m) => m.id !== id),
        })),

      resetToFixtures: () => set(INITIAL_STATE),

      clearAll: () => set({ financialMovements: [] }),
    }),
    {
      name: STORAGE_KEYS.FINANCE,
    }
  )
)

attachSupabaseSync({
  store: useFinanceStore,
  bindings: [
    {
      label: 'finance_movements',
      select: (s) => s.financialMovements,
      apply: (items) => useFinanceStore.setState({ financialMovements: items }),
      adapter: financeMovementAdapter,
    },
  ],
})
