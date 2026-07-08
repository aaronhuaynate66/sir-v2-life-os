'use client'
// SIR V2 — Fetch único de los planes personales de una persona.
//
// Antes lo hacían POR SEPARADO CycleHorizonCard y EventCareBriefCard (fetch
// duplicado). El Estudio del ciclo lo levanta acá una sola vez y lo inyecta a
// ambos. Refetch cuando cambia refreshKey (al agregar/borrar un plan).

import { useEffect, useState } from 'react'
import type { PersonalEvent } from './types'

export function usePersonalEvents(personId: string | null | undefined, refreshKey: number = 0) {
  const [events, setEvents] = useState<PersonalEvent[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    if (!personId) { setEvents([]); setStatus('idle'); return }
    let alive = true
    setStatus('loading')
    fetch(`/api/personal-events?personId=${encodeURIComponent(personId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return
        if (data && Array.isArray(data.events)) { setEvents(data.events as PersonalEvent[]); setStatus('ready') }
        else setStatus('error')
      })
      .catch(() => { if (alive) setStatus('error') })
    return () => { alive = false }
  }, [personId, refreshKey])

  return { events, status }
}
