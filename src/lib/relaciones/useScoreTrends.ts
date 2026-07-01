'use client'

// SIR V2 — useScoreTrends: hook client que trae los snapshots diarios del
// score relacional de TODAS las personas del usuario (una sola llamada a
// /api/person-score/snapshot, últimos 30 días) y devuelve un Record<personId,
// ScoreTrend>. Para el chip de tendencia en la lista de /relaciones + otros
// consumidores que quieran leer "¿mi bond con X viene subiendo?".
//
// Fail-soft: si el endpoint falla o no hay snapshots → devuelve {} sin
// romper. Cache local en memoria por window (los stores no vuelven a pedir
// hasta el próximo refresh de página).

import { useEffect, useMemo, useState } from 'react'

import { computeScoreTrend, type ScoreSnapshot, type ScoreTrend } from '@/lib/people/scoreTrend'

interface Snapshot {
  personId: string
  dateBucket: string
  global: number
}

let cached: Snapshot[] | null = null
let inFlight: Promise<Snapshot[]> | null = null

async function loadSnapshots(): Promise<Snapshot[]> {
  if (cached) return cached
  if (inFlight) return inFlight
  inFlight = fetch('/api/person-score/snapshot')
    .then(async (r) => {
      if (!r.ok) return []
      const j = (await r.json()) as { snapshots?: Snapshot[] }
      return Array.isArray(j.snapshots) ? j.snapshots : []
    })
    .catch(() => [])
    .then((snaps) => {
      cached = snaps
      inFlight = null
      return snaps
    })
  return inFlight
}

export function useScoreTrendsByPerson(): Record<string, ScoreTrend> {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(cached)

  useEffect(() => {
    if (snapshots) return
    let alive = true
    void loadSnapshots().then((s) => {
      if (alive) setSnapshots(s)
    })
    return () => {
      alive = false
    }
  }, [snapshots])

  return useMemo(() => {
    if (!snapshots || snapshots.length === 0) return {}
    const byPerson: Record<string, ScoreSnapshot[]> = {}
    for (const s of snapshots) {
      ;(byPerson[s.personId] ??= []).push({ dateBucket: s.dateBucket, global: s.global })
    }
    const trends: Record<string, ScoreTrend> = {}
    for (const [pid, snaps] of Object.entries(byPerson)) {
      trends[pid] = computeScoreTrend(snaps)
    }
    return trends
  }, [snapshots])
}
