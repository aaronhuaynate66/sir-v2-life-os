// SIR V2 — Self Store
// Manages selfMetrics, healthMetrics, sleepRecords with Zustand + persist
// + Supabase sync (Sesion 20c, 3 tables).
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SelfMetric, HealthMetric, SleepRecord, SelfDiagnosis } from '@/types'
import { type IdentityProfile, emptyIdentityProfile } from '@/lib/identity'
import { fixtureSleepRecords, fixtureMetrics } from '@/data/fixtures'
import { SEED_FIXTURES, purgeFixtureRows } from '@/data/fixtures/seed'
import { STORAGE_KEYS } from './storage'
import {
  attachSupabaseSync,
  selfMetricAdapter,
  healthMetricAdapter,
  sleepRecordAdapter,
  selfDiagnosisAdapter,
  identityProfileAdapter,
} from '@/lib/supabase/sync'

interface SelfState {
  selfMetrics: SelfMetric[]
  healthMetrics: HealthMetric[]
  sleepRecords: SleepRecord[]
  /** Diagnóstico personal (singleton por usuario). null = nunca creado. */
  diagnosis: SelfDiagnosis | null
  /** Anclas de identidad / perfil propio (singleton por usuario). null = nunca creado. */
  identityProfile: IdentityProfile | null
}

interface SelfActions {
  addSelfMetric: (metric: SelfMetric) => void
  updateSelfMetric: (id: string, patch: Partial<SelfMetric>) => void
  removeSelfMetric: (id: string) => void
  addHealthMetric: (metric: HealthMetric) => void
  addSleepRecord: (record: SleepRecord) => void
  /** Crea/actualiza el diagnóstico (un solo upsert). */
  setDiagnosis: (diagnosis: SelfDiagnosis) => void
  clearDiagnosis: () => void
  /** Crea/actualiza el perfil propio (un solo upsert por id). */
  setIdentityProfile: (profile: IdentityProfile) => void
  /** Merge parcial sobre el perfil (crea uno vacío si aún no existe). Útil
   *  para mutaciones inline como agregar/quitar una fecha importante. */
  updateIdentityProfile: (patch: Partial<IdentityProfile>) => void
  resetToFixtures: () => void
  clearAll: () => void
}

export type SelfStore = SelfState & SelfActions

// Fixtures SOLO fuera de producción. healthMetrics nunca tuvo fixtures.
// El diagnóstico NUNCA tiene fixtures: es data personal real del usuario.
const INITIAL_STATE: SelfState = SEED_FIXTURES
  ? { selfMetrics: fixtureMetrics, healthMetrics: [], sleepRecords: fixtureSleepRecords, diagnosis: null, identityProfile: null }
  : { selfMetrics: [], healthMetrics: [], sleepRecords: [], diagnosis: null, identityProfile: null }

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

      setDiagnosis: (diagnosis) => set({ diagnosis }),

      clearDiagnosis: () => set({ diagnosis: null }),

      setIdentityProfile: (identityProfile) => set({ identityProfile }),

      updateIdentityProfile: (patch) =>
        set((s) => {
          const base = s.identityProfile ?? emptyIdentityProfile('idn_' + Date.now())
          return {
            identityProfile: { ...base, ...patch, updatedAt: new Date().toISOString() },
          }
        }),

      resetToFixtures: () => set(INITIAL_STATE),

      clearAll: () =>
        set({ selfMetrics: [], healthMetrics: [], sleepRecords: [], diagnosis: null, identityProfile: null }),
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
    {
      // Singleton ↔ slice-array de 0/1 fila. DB autoritativo: el pull aplica
      // la fila remota (si existe) sobre la local; si no hay ninguna, queda null.
      label: 'self_diagnosis',
      select: (s) => (s.diagnosis ? [s.diagnosis] : []),
      apply: (items) => useSelfStore.setState({ diagnosis: items[0] ?? null }),
      adapter: selfDiagnosisAdapter,
    },
    {
      // Anclas de identidad: mismo patrón singleton ↔ slice-array de 0/1 fila.
      label: 'identity_profile',
      select: (s) => (s.identityProfile ? [s.identityProfile] : []),
      apply: (items) => useSelfStore.setState({ identityProfile: items[0] ?? null }),
      adapter: identityProfileAdapter,
    },
  ],
})
