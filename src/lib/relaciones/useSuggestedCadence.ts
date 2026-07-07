'use client'

// SIR V2 — useSuggestedCadence: hook client que trae la cadencia "automática"
// sugerida (por ritmo real) de TODAS las personas en una sola llamada a
// /api/relaciones/cadence, y devuelve un Record<personId, CadenceSuggestion>.
// Para que la etiqueta de cadencia de la lista coincida con el overdue que ve
// Reconectar (mismo helper puro server-side).
//
// Fail-soft: si el endpoint falla → {} sin romper. Cache en módulo por window.

import { useEffect, useState } from 'react'

import type { CadenceSuggestion } from '@/lib/people/cadence'

type CadenceMap = Record<string, CadenceSuggestion>

let cached: CadenceMap | null = null
let inFlight: Promise<CadenceMap> | null = null

async function load(): Promise<CadenceMap> {
  if (cached) return cached
  if (inFlight) return inFlight
  inFlight = fetch('/api/relaciones/cadence')
    .then(async (r) => {
      if (!r.ok) return {}
      const j = (await r.json()) as { cadence?: CadenceMap }
      return j.cadence && typeof j.cadence === 'object' ? j.cadence : {}
    })
    .catch(() => ({}))
    .then((m) => {
      cached = m
      inFlight = null
      return m
    })
  return inFlight
}

export function useSuggestedCadence(): CadenceMap {
  const [map, setMap] = useState<CadenceMap>(cached ?? {})

  useEffect(() => {
    if (cached) return
    let alive = true
    void load().then((m) => {
      if (alive) setMap(m)
    })
    return () => {
      alive = false
    }
  }, [])

  return map
}
