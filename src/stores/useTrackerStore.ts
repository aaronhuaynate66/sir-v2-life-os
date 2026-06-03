// SIR V2 — Tracker Store (migración 0051).
//
// Seguimiento de métricas externas en el tiempo. Una sola slice de store con
// DOS arrays (trackers + points) y dos bindings de sync (mismo patrón que
// relationships: people + relationships + personLinks). Las FKs
// trackers.objective_id/objective_step_id → goals/objective_steps viven en
// otros stores; en el caso normal el objetivo/paso YA existe en DB cuando se
// crea el tracker, así que se satisfacen. Si por carrera el tracker se pushea
// antes, la FK lo rechaza y el engine reintenta (1s/4s/16s).
//
// Denormalización: al agregar/quitar puntos recalculamos current_value/
// current_value_date/last_updated del tracker desde su serie, en el MISMO
// setState (un solo ciclo de diff → un push por slice).
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Tracker, TrackerPoint } from '@/types'
import { STORAGE_KEYS } from './storage'
import { attachSupabaseSync, trackerAdapter, trackerPointAdapter } from '@/lib/supabase/sync'
import { deriveCurrentFromPoints } from '@/lib/trackers/points'

interface TrackerState {
  trackers: Tracker[]
  points: TrackerPoint[]
}

interface TrackerActions {
  addTracker: (tracker: Tracker) => void
  updateTracker: (id: string, patch: Partial<Tracker>) => void
  removeTracker: (id: string) => void
  /**
   * Agrega N puntos a un tracker y recalcula sus campos denormalizados
   * (current_value, etc.) desde la serie resultante, en un solo setState.
   */
  addPoints: (trackerId: string, newPoints: TrackerPoint[]) => void
  removePoint: (id: string) => void
  clearAll: () => void
}

export type TrackerStore = TrackerState & TrackerActions

const INITIAL_STATE: TrackerState = { trackers: [], points: [] }

export const useTrackerStore = create<TrackerStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      addTracker: (tracker) => set((s) => ({ trackers: [...s.trackers, tracker] })),

      updateTracker: (id, patch) =>
        set((s) => ({
          trackers: s.trackers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      removeTracker: (id) =>
        set((s) => ({
          trackers: s.trackers.filter((t) => t.id !== id),
          // Limpiamos los puntos localmente; en DB lo hace ON DELETE CASCADE.
          points: s.points.filter((p) => p.trackerId !== id),
        })),

      addPoints: (trackerId, newPoints) =>
        set((s) => {
          if (newPoints.length === 0) return s
          const points = [...s.points, ...newPoints]
          const patch = deriveCurrentFromPoints(points, trackerId, new Date().toISOString())
          return {
            points,
            trackers: s.trackers.map((t) =>
              t.id === trackerId
                ? {
                    ...t,
                    ...patch,
                    // Una lectura nueva resetea el estado de alerta de email:
                    // si vuelve a cumplir/desactualizarse, el cron re-avisa.
                    lastAlertKind: undefined,
                  }
                : t,
            ),
          }
        }),

      removePoint: (id) =>
        set((s) => {
          const removed = s.points.find((p) => p.id === id)
          const points = s.points.filter((p) => p.id !== id)
          if (!removed) return { points }
          const patch = deriveCurrentFromPoints(points, removed.trackerId, new Date().toISOString())
          return {
            points,
            trackers: s.trackers.map((t) =>
              t.id === removed.trackerId ? { ...t, ...patch } : t,
            ),
          }
        }),

      clearAll: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: STORAGE_KEYS.TRACKER,
    },
  ),
)

attachSupabaseSync({
  store: useTrackerStore,
  bindings: [
    {
      label: 'trackers',
      select: (s) => s.trackers,
      apply: (items) => useTrackerStore.setState({ trackers: items }),
      adapter: trackerAdapter,
    },
    // points DESPUÉS de trackers: la FK tracker_points.tracker_id → trackers.id
    // necesita que el tracker exista; si el punto llega primero, el engine
    // reintenta y pasa cuando el tracker aterriza.
    {
      label: 'tracker_points',
      select: (s) => s.points,
      apply: (items) => useTrackerStore.setState({ points: items }),
      adapter: trackerPointAdapter,
    },
  ],
})
