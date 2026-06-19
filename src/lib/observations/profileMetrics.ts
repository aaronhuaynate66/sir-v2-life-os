// SIR V2 — Serie temporal de una métrica de perfil social (seguidores/seguidos/
// posts) a partir del historial de capturas. PURO. Para ver la VARIACIÓN.

import { aggregateByDay, type SeriesPoint } from '@/lib/charts/series'

export interface ProfileMetricPoint {
  observedAt: string
  followers: number | null
  following: number | null
  posts: number | null
}

export type ProfileMetricField = 'followers' | 'following' | 'posts'

/** Serie {date, value} de un campo, último valor por día (varias capturas el
 *  mismo día → la más reciente). Descarta puntos sin valor. */
export function profileMetricSeries(points: ProfileMetricPoint[], field: ProfileMetricField): SeriesPoint[] {
  const raw = points
    .filter((p) => p[field] !== null)
    .map((p) => ({ date: p.observedAt, value: p[field] as number }))
  return aggregateByDay(raw, 'last')
}

/** Delta del último punto vs el anterior (para "+N / −N desde la captura
 *  anterior"). null si hay menos de 2 puntos. */
export function lastDelta(series: SeriesPoint[]): number | null {
  if (series.length < 2) return null
  const sorted = series.slice().sort((a, b) => a.date.localeCompare(b.date))
  return sorted[sorted.length - 1].value - sorted[sorted.length - 2].value
}
