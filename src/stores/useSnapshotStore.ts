// SIR V2 — Snapshot History Store (Sesion 6)
// Persists SnapshotSummary entries captured by useSnapshotCapture.
// FIFO cap, ortogonal a useMemoryStore (memoria semantica) y a useRichContext (snapshot vivo).
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SnapshotSummary } from '@/engines/context'

const DEFAULT_MAX_SIZE = 100

interface SnapshotState {
    snapshots: SnapshotSummary[]
    maxSize: number
}

interface SnapshotActions {
    addSnapshot: (summary: SnapshotSummary) => void
    clearHistory: () => void
    getRecent: (n: number) => SnapshotSummary[]
    getByDate: (date: string) => SnapshotSummary[]
    getCount: () => number
}

export type SnapshotStore = SnapshotState & SnapshotActions

const INITIAL_STATE: SnapshotState = {
    snapshots: [],
    maxSize: DEFAULT_MAX_SIZE,
}

export const useSnapshotStore = create<SnapshotStore>()(
    persist(
        (set, get) => ({
            ...INITIAL_STATE,

            addSnapshot: (summary) =>
                set((s) => {
                    const next = [...s.snapshots, summary]
                    while (next.length > s.maxSize) next.shift()
                    return { snapshots: next }
                }),

            clearHistory: () => set({ snapshots: [] }),

            getRecent: (n) => {
                const all = get().snapshots
                if (n <= 0) return []
                return all.slice(Math.max(0, all.length - n))
            },

            getByDate: (date) =>
                get().snapshots.filter((s) => s.date === date),

            getCount: () => get().snapshots.length,
        }),
        {
            name: 'sir-v2-snapshot-history',
        }
    )
)
