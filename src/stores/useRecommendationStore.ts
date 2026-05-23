// SIR V2 — Recommendation Store
// Manages recommendations with Zustand + persist
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Recommendation, RecommendationStatus } from '@/types'
import { fixtureRecommendation } from '@/data/fixtures'
import { STORAGE_KEYS } from './storage'

interface RecommendationState {
    recommendations: Recommendation[]
}

interface RecommendationActions {
    addRecommendation: (rec: Recommendation) => void
    updateRecommendation: (id: string, patch: Partial<Recommendation>) => void
    removeRecommendation: (id: string) => void
    completeRecommendation: (id: string) => void
    dismissRecommendation: (id: string) => void
    setStatus: (id: string, status: RecommendationStatus) => void
    resetToFixtures: () => void
    clearAll: () => void
}

export type RecommendationStore = RecommendationState & RecommendationActions

const INITIAL_STATE: RecommendationState = {
    recommendations: [fixtureRecommendation],
}

export const useRecommendationStore = create<RecommendationStore>()(
    persist(
          (set) => ({
                  ...INITIAL_STATE,

                  addRecommendation: (rec) =>
                            set((s) => ({ recommendations: [...s.recommendations, rec] })),

                  updateRecommendation: (id, patch) =>
                            set((s) => ({
                                        recommendations: s.recommendations.map((r) =>
                                                      r.id === id ? { ...r, ...patch } : r
                                                                                         ),
                            })),

                  removeRecommendation: (id) =>
                            set((s) => ({
                                        recommendations: s.recommendations.filter((r) => r.id !== id),
                            })),

                  completeRecommendation: (id) =>
                            set((s) => ({
                                        recommendations: s.recommendations.map((r) =>
                                                      r.id === id ? { ...r, status: 'completed' } : r
                                                                                         ),
                            })),

                  dismissRecommendation: (id) =>
                            set((s) => ({
                                        recommendations: s.recommendations.map((r) =>
                                                      r.id === id ? { ...r, status: 'dismissed' } : r
                                                                                         ),
                            })),

                  setStatus: (id, status) =>
                            set((s) => ({
                                        recommendations: s.recommendations.map((r) =>
                                                      r.id === id ? { ...r, status } : r
                                                                                         ),
                            })),

                  resetToFixtures: () => set(INITIAL_STATE),

                  clearAll: () => set({ recommendations: [] }),
          }),
      {
              name: STORAGE_KEYS.RECOMMENDATION,
      }
        )
  )
