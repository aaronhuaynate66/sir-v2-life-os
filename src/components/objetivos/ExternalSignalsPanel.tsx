'use client'
// SIR V2 — Capa de contexto externo (Motor #8). Sobre un objetivo-viaje:
//  (fase 1) señal de TIPO DE CAMBIO — destaca solo si el dólar se movió.
//  (fase 2) EVENTOS del lugar (GDELT) — contexto a CONFIRMAR, no alarma.
// Solo aparece si el objetivo tiene viaje (toca el nodo). Filtro de acción.

import { useEffect, useState } from 'react'
import { Globe2, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { computeFxSignal, type FxSignal } from '@/lib/external/fxExposure'
import type { ExternalEvent } from '@/lib/external/events'

export function ExternalSignalsPanel({ goalId }: { goalId: string }) {
  const [hasTravel, setHasTravel] = useState(false)
  const [location, setLocation] = useState<string>('')
  const [fx, setFx] = useState<FxSignal | null>(null)
  const [events, setEvents] = useState<ExternalEvent[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      let travel = false; let loc = ''
      try {
        const p = await fetch(`/api/objectives/plan?goal_id=${encodeURIComponent(goalId)}`).then((r) => (r.ok ? r.json() : null))
        travel = !!(p?.plan?.travelStart || p?.plan?.eventDate)
        loc = p?.plan?.location || ''
      } catch { /* */ }
      if (!alive) return
      setHasTravel(travel); setLocation(loc)
      if (!travel) { setReady(true); return }
      // FX
      try {
        const j = await fetch('/api/external/fx').then((r) => (r.ok ? r.json() : null))
        const rate = typeof j?.rate === 'number' ? j.rate : null
        if (rate && alive) {
          const key = `sir_fx_base_${goalId}`
          let base: number | null = null
          try { const c = localStorage.getItem(key); base = c ? Number(c) : null } catch { /* */ }
          setFx(computeFxSignal(rate, base))
          try { localStorage.setItem(key, String(rate)) } catch { /* */ }
        }
      } catch { /* */ }
      // Eventos del lugar
      if (loc) {
        try {
          const j = await fetch(`/api/external/events?location=${encodeURIComponent(loc)}`).then((r) => (r.ok ? r.json() : null))
          if (alive && Array.isArray(j?.events)) setEvents(j.events)
        } catch { /* */ }
      }
      setReady(true)
    })()
    return () => { alive = false }
  }, [goalId])

  if (!ready || !hasTravel) return null
  const moved = fx && (fx.direction === 'up' || fx.direction === 'down')
  if (!fx && events.length === 0) return null
  const Icon = fx?.direction === 'up' ? TrendingUp : fx?.direction === 'down' ? TrendingDown : Minus
  const color = fx?.direction === 'up' ? '#e5564c' : fx?.direction === 'down' ? '#2dd4a7' : '#8a8f98'

  return (
    <Card style={moved ? { borderColor: `${color}55` } : undefined}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Globe2} label="Contexto externo" />

        {fx && (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold">USD S/ {fx.rate.toFixed(3)}</span>
              {fx.deltaPct !== null && (
                <span className="flex items-center gap-1 text-[12px]" style={{ color }}>
                  <Icon size={13} /> {fx.deltaPct > 0 ? '+' : ''}{fx.deltaPct}% desde tu última visita
                </span>
              )}
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {moved
                ? `Parte de tu viaje está en dólares — el dólar ${fx.direction === 'up' ? 'subió, tu gasto se encareció' : 'bajó, tu gasto se abarató'}.`
                : 'Dólar estable desde tu última visita.'}
            </p>
          </div>
        )}

        {events.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              Noticias de {location.split(',').slice(-1)[0].trim()} · podrían tocar tu viaje (confirmá vos)
            </p>
            <ul className="space-y-1.5">
              {events.map((e) => (
                <li key={e.url} className="text-[13px] leading-snug">
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-foreground/90 hover:underline inline-flex items-start gap-1">
                    <ExternalLink size={11} className="mt-1 shrink-0 text-muted-foreground" />
                    <span>{e.title}</span>
                  </a>
                  <span className="text-[11px] text-muted-foreground"> · {e.domain}{e.date ? ` · ${e.date}` : ''}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10.5px] text-muted-foreground/70">Titulares automáticos (GDELT). SIR no afirma que te afecten — son contexto para que vos juzgues.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
