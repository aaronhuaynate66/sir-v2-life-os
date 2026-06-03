// SIR V2 — Helpers PUROS de la serie temporal de un tracker (tracker_points).

import type { SeriesPoint } from '@/lib/charts/series'
import type { Tracker, TrackerPoint, TrackerPointSource } from '@/types'

/** Puntos de un tracker, ordenados por fecha ascendente (copia). */
export function pointsForTracker(points: TrackerPoint[], trackerId: string): TrackerPoint[] {
  return points
    .filter((p) => p.trackerId === trackerId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
}

/** El último punto (por fecha) de un tracker, o null. */
export function latestPoint(points: TrackerPoint[], trackerId: string): TrackerPoint | null {
  const sorted = pointsForTracker(points, trackerId)
  return sorted.length > 0 ? sorted[sorted.length - 1] : null
}

/** Serie {date, value} para el chart, ya ordenada. */
export function toSeries(points: TrackerPoint[], trackerId: string): SeriesPoint[] {
  return pointsForTracker(points, trackerId).map((p) => ({ date: p.date, value: p.value }))
}

/**
 * Recalcula los campos denormalizados del tracker (currentValue,
 * currentValueDate, lastUpdated) desde su serie de puntos. Devuelve el patch a
 * aplicar. Si no hay puntos, deja current_* sin tocar (devuelve {}).
 */
export function deriveCurrentFromPoints(
  points: TrackerPoint[],
  trackerId: string,
  now: string,
): Partial<Tracker> {
  const last = latestPoint(points, trackerId)
  if (!last) return {}
  return {
    currentValue: last.value,
    currentValueDate: last.date,
    lastUpdated: now,
  }
}

export interface NewPointInput {
  value: number
  date: string
  source?: TrackerPointSource
  note?: string
}

/**
 * Construye TrackerPoints nuevos a partir de lecturas crudas (ej. salida de
 * Vision o de texto), deduplicando por fecha: si dos lecturas caen el mismo día,
 * gana la ÚLTIMA del array (la captura más reciente del usuario). El id es
 * determinístico-ish por índice + base para no colisionar en un mismo batch.
 */
export function buildPoints(
  trackerId: string,
  readings: NewPointInput[],
  idBase: string,
): TrackerPoint[] {
  const byDate = new Map<string, NewPointInput>()
  for (const r of readings) {
    if (!Number.isFinite(r.value) || !r.date) continue
    byDate.set(r.date, r) // la última por fecha gana
  }
  let i = 0
  return Array.from(byDate.values()).map((r) => ({
    id: `${idBase}_${i++}`,
    trackerId,
    value: r.value,
    date: r.date,
    source: r.source ?? 'manual_screenshot',
    note: r.note ?? '',
    createdAt: new Date().toISOString(),
  }))
}
