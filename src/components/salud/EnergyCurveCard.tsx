'use client'

// SIR V2 — EnergyCurveCard (11·M3): tu energía por hora del día.
// Corre computeEnergyCurve sobre self_metrics 'energy' agrupado por hora Lima.
// Mini-barras solo de las horas con datos (≥3 muestras) — no interpola huecos.
// Se oculta si no hay cobertura horaria suficiente.

import { useMemo } from 'react'
import { Activity } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { computeEnergyCurve } from '@/lib/chrono/energyCurve'

export function EnergyCurveCard() {
  const { selfMetrics } = useSelfStore()

  const curve = useMemo(() => {
    const samples = selfMetrics.filter((m) => m.category === 'energy').map((m) => ({ value: m.value, timestamp: m.timestamp }))
    return computeEnergyCurve(samples)
  }, [selfMetrics])

  if (!curve.sufficient) return null

  const maxAvg = Math.max(...curve.buckets.map((b) => b.avg), 1)

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tu energía por hora</h2>
        </div>

        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Pico ~<span className="text-foreground font-mono">{curve.peakHour}h</span> ·
          bajón ~<span className="text-foreground font-mono">{curve.troughHour}h</span>. Solo horas con datos.
        </p>

        <div className="flex items-end gap-1.5 h-16" aria-hidden="true">
          {curve.buckets.map((b) => (
            <div key={b.hour} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div
                className={`w-full rounded-t ${b.hour === curve.peakHour ? 'bg-ok' : b.hour === curve.troughHour ? 'bg-warn' : 'bg-brand/50'}`}
                style={{ height: `${Math.max(6, (b.avg / maxAvg) * 100)}%` }}
                title={`${b.hour}h · ${b.avg}/10 (${b.samples})`}
              />
              <span className="text-[9px] text-muted-foreground/60 font-mono tabular-nums">{b.hour}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
