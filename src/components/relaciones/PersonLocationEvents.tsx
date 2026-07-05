'use client'

// SIR V2 — 18·M4: eventos por ubicación de una persona (opt-in, confianza baja).
//
// Generaliza el GDELT-por-lugar (que ya vivía en objetivos-viaje) a la gente que
// te importa: qué está pasando DONDE VIVE alguien clave. Honesto con su límite
// (doc 18: GDELT es ruidoso → SIEMPRE "contexto a confirmar", nunca alarma).
// OPT-IN de verdad: no auto-fetch. Aparece un botón y SOLO al tocarlo consulta —
// cero ruido pasivo. Reusa /api/external/events y el tipo ExternalEvent.

import { useState } from 'react'
import { Globe2, ExternalLink, Loader2 } from 'lucide-react'

import type { ExternalEvent } from '@/lib/external/events'

type State = 'idle' | 'loading' | 'done' | 'empty' | 'error'

export function PersonLocationEvents({ location, personName }: { location: string; personName: string }) {
  const [state, setState] = useState<State>('idle')
  const [events, setEvents] = useState<ExternalEvent[]>([])

  const loc = location.trim()
  if (!loc) return null
  const cityLabel = loc.split(',').slice(-1)[0].trim() || loc

  async function load() {
    setState('loading')
    try {
      const j = await fetch(`/api/external/events?location=${encodeURIComponent(loc)}`).then((r) => (r.ok ? r.json() : null))
      const list = Array.isArray(j?.events) ? (j.events as ExternalEvent[]) : []
      setEvents(list)
      setState(list.length > 0 ? 'done' : 'empty')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {state === 'idle' && (
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Globe2 size={13} strokeWidth={1.75} aria-hidden="true" />
          ¿Qué está pasando en {cityLabel}?
        </button>
      )}

      {state === 'loading' && (
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Buscando en {cityLabel}…
        </span>
      )}

      {state === 'empty' && (
        <p className="text-[12px] text-muted-foreground">Sin titulares recientes de {cityLabel}.</p>
      )}
      {state === 'error' && (
        <p className="text-[12px] text-muted-foreground">No se pudo consultar ahora. Reintentá más tarde.</p>
      )}

      {state === 'done' && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
            Titulares de {cityLabel} · donde vive {personName.split(' ')[0]} (confirmá vos si toca algo)
          </p>
          <ul className="space-y-1.5">
            {events.map((e) => (
              <li key={e.url} className="text-[13px] leading-snug">
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-foreground/90 hover:underline inline-flex items-start gap-1">
                  <ExternalLink size={11} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>{e.title}</span>
                </a>
                <span className="text-[11px] text-muted-foreground"> · {e.domain}{e.date ? ` · ${e.date}` : ''}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10.5px] text-muted-foreground/70">
            Titulares automáticos (GDELT), confianza baja. SIR no afirma que te afecten ni que afecten a {personName.split(' ')[0]} — son contexto para que vos juzgues.
          </p>
        </div>
      )}
    </div>
  )
}
