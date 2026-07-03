// SIR V2 — Feedback loop store (A8). Registra las acciones sobre las que actuás
// (recomendaciones completadas, decisiones) con la paz de ese momento, para que
// SIR aprenda qué te funciona. Persistido en localStorage; el outcome (paz N
// días después) se computa on-read desde el histórico de snapshots.
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FeedbackEvent } from '@/engines/learning'

const MAX = 500

interface FeedbackState {
  events: FeedbackEvent[]
}
interface FeedbackActions {
  logFeedback: (e: FeedbackEvent) => void
  clearFeedback: () => void
}

export const useFeedbackStore = create<FeedbackState & FeedbackActions>()(
  persist(
    (set) => ({
      events: [],
      logFeedback: (e) => set((s) => ({ events: [...s.events, e].slice(-MAX) })),
      clearFeedback: () => set({ events: [] }),
    }),
    { name: 'sir-v2-feedback-events' },
  ),
)
