'use client'

// SIR V2 — useHasHydrated (Sesion 11)
// Detecta cuando todos los stores persistidos han hidratado desde localStorage.
// Zustand persist hidrata async DESPUES del primer render: sin este gate, los
// consumidores muestran valores stale/default hasta la primera mutacion.

import { useEffect, useState } from 'react'
import { useSelfStore } from '@/stores/useSelfStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useSignalStore } from '@/stores/useSignalStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useMemoryStore } from '@/stores/useMemoryStore'
import { useRecommendationStore } from '@/stores/useRecommendationStore'
import { useSnapshotStore } from '@/stores/useSnapshotStore'

const STORES = [
  useSelfStore,
  useFinanceStore,
  useGoalStore,
  useObjectiveStepStore,
  useSignalStore,
  useRelationshipStore,
  useMemoryStore,
  useRecommendationStore,
  useSnapshotStore,
] as const

export function useHasHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const check = () => {
      if (STORES.every((s) => s.persist.hasHydrated())) {
        setHydrated(true)
      }
    }
    check()
    const unsubs = STORES.map((s) => s.persist.onFinishHydration(() => check()))
    return () => {
      unsubs.forEach((u) => u())
    }
  }, [])

  return hydrated
}
