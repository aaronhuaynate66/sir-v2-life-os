// SIR V2 — Snapshot History Store (Sesion 6)
// Persists SnapshotSummary entries captured by useSnapshotCapture.
// FIFO cap, ortogonal a useMemoryStore (memoria semantica) y a useRichContext (snapshot vivo).
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SnapshotSummary } from '@/engines/context'

const DEFAULT_MAX_SIZE = 100

// Two summaries are trivial duplicates if every materially-meaningful field
// matches. id/timestamp/date are excluded because they always differ per build;
// summary[] is excluded because it derives deterministically from the same inputs.
function isTrivialDuplicate(a: SnapshotSummary, b: SnapshotSummary): boolean {
    return (
        a.peaceScore === b.peaceScore &&
        a.peaceMode === b.peaceMode &&
        a.triggerReason === b.triggerReason &&
        JSON.stringify(a.risks) === JSON.stringify(b.risks) &&
        JSON.stringify(a.opportunities) === JSON.stringify(b.opportunities)
    )
}

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
                    const last = s.snapshots[s.snapshots.length - 1]
                    if (last !== undefined && isTrivialDuplicate(last, summary)) {
                        return s
                    }
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
