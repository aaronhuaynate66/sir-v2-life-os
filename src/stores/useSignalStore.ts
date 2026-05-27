// SIR V2 — Signal Store
// Manages signals with Zustand + persist + Supabase sync (Sesion 20c)
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Signal } from '@/types'
import { fixtureSignals } from '@/data/fixtures'
import { STORAGE_KEYS } from './storage'
import { attachSupabaseSync, signalAdapter } from '@/lib/supabase/sync'

interface SignalState {
  signals: Signal[]
}

interface SignalActions {
  addSignal: (signal: Signal) => void
  updateSignal: (id: string, patch: Partial<Signal>) => void
  removeSignal: (id: string) => void
  resolveSignal: (id: string) => void
  resetToFixtures: () => void
  clearAll: () => void
}

export type SignalStore = SignalState & SignalActions

const INITIAL_STATE: SignalState = {
  signals: fixtureSignals,
}

export const useSignalStore = create<SignalStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      addSignal: (signal) =>
        set((s) => ({ signals: [...s.signals, signal] })),

      updateSignal: (id, patch) =>
        set((s) => ({
          signals: s.signals.map((sig) => (sig.id === id ? { ...sig, ...patch } : sig)),
        })),

      removeSignal: (id) =>
        set((s) => ({ signals: s.signals.filter((sig) => sig.id !== id) })),

      resolveSignal: (id) =>
        set((s) => ({
          signals: s.signals.map((sig) =>
            sig.id === id ? { ...sig, resolved: true } : sig,
          ),
        })),

      resetToFixtures: () => set(INITIAL_STATE),

      clearAll: () => set({ signals: [] }),
    }),
    {
      name: STORAGE_KEYS.SIGNAL,
    },
  ),
)

attachSupabaseSync({
  store: useSignalStore,
  bindings: [
    {
      label: 'signals',
      select: (s) => s.signals,
      apply: (items) => useSignalStore.setState({ signals: items }),
      adapter: signalAdapter,
    },
  ],
})
