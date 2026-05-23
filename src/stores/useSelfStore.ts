// SIR V2 — Self Store
// Manages selfMetrics, healthMetrics, sleepRecords with Zustand + persist
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SelfMetric, HealthMetric, SleepRecord } from '@/types'
import { fixtureSleepRecords, fixtureMetrics } from '@/data/fixtures'
import { STORAGE_KEYS } from './storage'

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

const INITIAL_STATE: SelfState = {
  selfMetrics: fixtureMetrics,
  healthMetrics: [],
  sleepRecords: fixtureSleepRecords,
}

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
    }
  )
)
