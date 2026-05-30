// SIR V2 — Finance Store
// Manages financialMovements with Zustand + persist + Supabase sync.
// Currency support (Sesion Currency): movements carry currency,
// exchangeRate and amountPEN. The persisted shape is versioned; legacy
// rows from before currency support are upgraded on hydration: assumed
// PEN with rate 1.0 and amountPEN = amount.
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Currency, FinancialMovement } from '@/types'
import { fixtureFinancialMovements } from '@/data/fixtures'
import { SEED_FIXTURES, purgeFixtureRows } from '@/data/fixtures/seed'
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

const INITIAL_STATE: FinanceState = SEED_FIXTURES
  ? { financialMovements: fixtureFinancialMovements }
  : { financialMovements: [] }

// Pre-currency shape (version 1): no exchangeRate, no amountPEN, currency
// was a free string defaulting to 'USD'. Upgrade reinterprets every row
// as PEN with rate 1.0 (decision documented in the session brief).
interface LegacyFinancialMovement {
  id: string
  type: FinancialMovement['type']
  amount: number
  currency?: string
  exchangeRate?: number
  amountPEN?: number
  category: FinancialMovement['category']
  description: string
  date: string
  recurrent: boolean
  recurrentPeriod?: string
  relatedGoal?: string
  tags: string[]
}

function upgradeMovement(m: LegacyFinancialMovement): FinancialMovement {
  const currency: Currency = m.currency === 'USD' || m.currency === 'PEN' ? m.currency : 'PEN'
  // If the legacy row was nominally USD we still reinterpret as PEN per
  // the session decision (no item-by-item TC wizard). The exception is
  // a row already upgraded by an earlier hydration that carries valid
  // exchangeRate + amountPEN.
  if (typeof m.exchangeRate === 'number' && typeof m.amountPEN === 'number') {
    return {
      ...m,
      currency,
      exchangeRate: m.exchangeRate,
      amountPEN: m.amountPEN,
    } as FinancialMovement
  }
  return {
    ...m,
    currency: 'PEN',
    exchangeRate: 1.0,
    amountPEN: m.amount,
  } as FinancialMovement
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
      // v2: upgrade de moneda (legacy -> PEN). v3: purga fixtures sembrados
      // (f1-f5) del localStorage de clientes viejos (deuda split-brain).
      version: 3,
      migrate: (state, fromVersion) => {
        if (!state || typeof state !== 'object') return state
        const s = state as { financialMovements?: LegacyFinancialMovement[] }
        // Paso 1 (solo si viene de < v2): reinterpretar moneda.
        const upgraded =
          fromVersion < 2
            ? (s.financialMovements ?? []).map(upgradeMovement)
            : ((s.financialMovements ?? []) as unknown as FinancialMovement[])
        // Paso 2 (siempre): purgar fixtures.
        return {
          ...(state as object),
          financialMovements: purgeFixtureRows(upgraded),
        } as FinanceState
      },
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
