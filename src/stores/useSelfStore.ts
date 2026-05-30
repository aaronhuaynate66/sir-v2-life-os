// SIR V2 — Self Store
// Manages selfMetrics, healthMetrics, sleepRecords with Zustand + persist
// + Supabase sync (Sesion 20c, 3 tables).
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SelfMetric, HealthMetric, SleepRecord } from '@/types'
import { fixtureSleepRecords, fixtureMetrics } from '@/data/fixtures'
import { SEED_FIXTURES, purgeFixtureRows } from '@/data/fixtures/seed'
import { STORAGE_KEYS } from './storage'
import {
  attachSupabaseSync,
  selfMetricAdapter,
  healthMetricAdapter,
  sleepRecordAdapter,
} from '@/lib/supabase/sync'

interface SelfState {
  selfMetrics: SelfMetric[]
  healthMetrics: HealthMetric[]
  sleepRecords: SleepRecord[]
}

interface SelfActions {
  addSelfMetric: (metric: SelfMetric) => void
  updateSelfMetric: (id: string, patch: Partial<SelfMetric>) => void
  removeSelfMetric: (id: string) => void
  addHealthMetric: (metric: HealthMetric) => void
  addSleepRecord: (record: SleepRecord) => void
  resetToFixtures: () => void
  clearAll: () => void
}

export type SelfStore = SelfState & SelfActions

// Fixtures SOLO fuera de producción. healthMetrics nunca tuvo fixtures.
const INITIAL_STATE: SelfState = SEED_FIXTURES
  ? { selfMetrics: fixtureMetrics, healthMetrics: [], sleepRecords: fixtureSleepRecords }
  : { selfMetrics: [], healthMetrics: [], sleepRecords: [] }

export const useSelfStore = create<SelfStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      addSelfMetric: (metric) =>
        set((s) => ({ selfMetrics: [...s.selfMetrics, metric] })),

      updateSelfMetric: (id, patch) =>
        set((s) => ({
          selfMetrics: s.selfMetrics.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),

      removeSelfMetric: (id) =>
        set((s) => ({ selfMetrics: s.selfMetrics.filter((m) => m.id !== id) })),

      addHealthMetric: (metric) =>
        set((s) => ({ healthMetrics: [...s.healthMetrics, metric] })),

      addSleepRecord: (record) =>
        set((s) => ({ sleepRecords: [...s.sleepRecords, record] })),

      resetToFixtures: () => set(INITIAL_STATE),

      clearAll: () =>
        set({ selfMetrics: [], healthMetrics: [], sleepRecords: [] }),
    }),
    {
      name: STORAGE_KEYS.SELF,
      // v1: purga fixtures sembrados (sl1-3, m1-6) de clientes viejos.
      version: 1,
      migrate: (state) => {
        if (!state || typeof state !== 'object') return state
        const s = state as Partial<SelfState>
        return {
          ...(state as object),
          selfMetrics: purgeFixtureRows(s.selfMetrics),
          sleepRecords: purgeFixtureRows(s.sleepRecords),
        } as SelfState
      },
    }
  )
)

attachSupabaseSync({
  store: useSelfStore,
  bindings: [
    {
      label: 'self_metrics',
      select: (s) => s.selfMetrics,
      apply: (items) => useSelfStore.setState({ selfMetrics: items }),
      adapter: selfMetricAdapter,
    },
    {
      label: 'health_metrics',
      select: (s) => s.healthMetrics,
      apply: (items) => useSelfStore.setState({ healthMetrics: items }),
      adapter: healthMetricAdapter,
    },
    {
      label: 'sleep_records',
      select: (s) => s.sleepRecords,
      apply: (items) => useSelfStore.setState({ sleepRecords: items }),
      adapter: sleepRecordAdapter,
    },
  ],
})
