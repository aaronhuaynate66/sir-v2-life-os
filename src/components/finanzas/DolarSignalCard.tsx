'use client'

// SIR V2 — DolarSignalCard (18·M1): señal externa del tipo de cambio USD/PEN,
// generalizada más allá del caso-viaje. Aparece SOLO si el dólar se movió vs tu
// última referencia (filtro de acción: si está plano, no molesta). Muestra el
// impacto honesto por cada US$1000 (pensando en la mudanza / el Mundial). El
// baseline vive en localStorage ("tu última visita") — cero backend.
//
// Reusa la infra ya existente: computeFxSignal + penImpact (lib/external) y
// GET /api/external/fx.

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Globe2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { computeFxSignal, penImpact, type FxSignal } from '@/lib/external/fxExposure'
import { cn } from '@/lib/utils'

const LS_KEY = 'sir_fx_baseline_v1'
const REF_USD = 1000 // monto de referencia para el impacto (mudanza / Mundial en USD)

export function DolarSignalCard() {
  const [signal, setSignal] = useState<FxSignal | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const r = await fetch('/api/external/fx', { cache: 'no-store' })
        if (!r.ok) return
        const j = (await r.json()) as { rate: number | null }
        const rate = j.rate
        if (!alive || typeof rate !== 'number' || !Number.isFinite(rate)) return

        const raw = localStorage.getItem(LS_KEY)
        const baseline = raw ? Number(raw) : null
        if (baseline == null || !Number.isFinite(baseline)) {
          // Primera vez: fijamos la referencia en silencio (no hay con qué comparar).
          localStorage.setItem(LS_KEY, String(rate))
          return
        }
        setSignal(computeFxSignal(rate, baseline))
      } catch { /* sin señal */ }
    })()
    return () => { alive = false }
  }, [])

  // Solo molesta si se movió de verdad (up/down); plano/none → nada.
  if (!signal || (signal.direction !== 'up' && signal.direction !== 'down') || signal.baseline == null) return null

  const up = signal.direction === 'up'
  const Icon = up ? TrendingUp : TrendingDown
  const impact = penImpact(REF_USD, signal.rate, signal.baseline) // + si subió, − si bajó
  const absImpact = Math.abs(impact)

  function acknowledge() {
    localStorage.setItem(LS_KEY, String(signal!.rate))
    setSignal(null)
  }

  return (
    <Card className={cn('shadow-none mb-6', up ? 'border-bad/30' : 'border-ok/30')}>
      <CardContent className={cn('p-4 sm:p-5', up ? 'bg-bad-soft/40' : 'bg-ok-soft/40')}>
        <div className="flex items-start gap-3">
          <Globe2 size={18} strokeWidth={1.75} className="text-muted-foreground/70 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">Señal externa · dólar</span>
              <span className={cn('inline-flex items-center gap-1 text-sm font-medium', up ? 'text-bad' : 'text-ok')}>
                <Icon size={14} strokeWidth={2} />
                {up ? 'subió' : 'bajó'} {Math.abs(signal.deltaPct ?? 0)}%
              </span>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed mt-1.5">
              El dólar está a <span className="font-mono">S/ {signal.rate.toFixed(3)}</span> (tu referencia era{' '}
              <span className="font-mono">S/ {signal.baseline.toFixed(3)}</span>). Por cada{' '}
              <span className="font-medium">US$ {REF_USD.toLocaleString('es')}</span> que necesites —la mudanza, el Mundial—
              son <span className={cn('font-medium', up ? 'text-bad' : 'text-ok')}>~S/ {absImpact.toLocaleString('es')} {up ? 'más' : 'menos'}</span> que antes.
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed">
              Toca lo que tengas o necesites en dólares — no los soles que ya tienes. Contexto, no alarma.
            </p>
            <button
              type="button"
              onClick={acknowledge}
              className="mt-2 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Ok, actualizar mi referencia
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
