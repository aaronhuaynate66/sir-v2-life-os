'use client'
// SIR V2 — Capa de contexto externo (Motor #8), fase 1. Señal de tipo de cambio
// sobre un objetivo-viaje: solo aparece si el objetivo tiene viaje (toca el nodo)
// y se destaca solo si el dólar se movió desde tu última visita (filtro de acción).

import { useCallback, useEffect, useState } from 'react'
import { Globe2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { computeFxSignal, type FxSignal } from '@/lib/external/fxExposure'

export function ExternalSignalsPanel({ goalId }: { goalId: string }) {
  const [hasTravel, setHasTravel] = useState(false)
  const [fx, setFx] = useState<FxSignal | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      let travel = false
      try {
        const p = await fetch(`/api/objectives/plan?goal_id=${encodeURIComponent(goalId)}`).then((r) => (r.ok ? r.json() : null))
        travel = !!(p?.plan?.travelStart || p?.plan?.eventDate)
      } catch { /* */ }
      if (!alive) return
      setHasTravel(travel)
      if (!travel) { setReady(true); return }
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
      setReady(true)
    })()
    return () => { alive = false }
  }, [goalId])

  if (!ready || !hasTravel || !fx) return null

  const moved = fx.direction === 'up' || fx.direction === 'down'
  const Icon = fx.direction === 'up' ? TrendingUp : fx.direction === 'down' ? TrendingDown : Minus
  const color = fx.direction === 'up' ? '#e5564c' : fx.direction === 'down' ? '#2dd4a7' : '#8a8f98'

  return (
    <Card style={moved ? { borderColor: `${color}55` } : undefined}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Globe2} label="Señal externa · tipo de cambio" />
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[15px] font-semibold">USD S/ {fx.rate.toFixed(3)}</span>
          {fx.deltaPct !== null && (
            <span className="flex items-center gap-1 text-[12px]" style={{ color }}>
              <Icon size={13} /> {fx.deltaPct > 0 ? '+' : ''}{fx.deltaPct}% desde tu última visita
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {moved
            ? `Parte de tu viaje está en dólares (hotel, comida, visa). El dólar ${fx.direction === 'up' ? 'subió' : 'bajó'} — tu gasto en USD ${fx.direction === 'up' ? 'se encareció' : 'se abarató'} en esa proporción.`
            : 'El dólar está estable desde tu última visita. Tu presupuesto del viaje en dólares no se movió.'}
        </p>
      </CardContent>
    </Card>
  )
}
