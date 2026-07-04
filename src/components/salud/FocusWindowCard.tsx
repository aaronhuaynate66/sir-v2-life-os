'use client'

// SIR V2 — FocusWindowCard (11·M5): ventana óptima para foco.
// Cruza la curva de energía (M3) con el cronotipo (M2) para sugerir franjas de
// trabajo profundo vs. mecánico. Solo aparece si ambos insumos alcanzan.

import { useMemo } from 'react'
import { Crosshair } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { computeChronotype } from '@/lib/chrono/chronotype'
import { computeEnergyCurve } from '@/lib/chrono/energyCurve'
import { computeFocusWindow } from '@/lib/chrono/focusWindow'

export function FocusWindowCard() {
  const { sleepRecords, selfMetrics } = useSelfStore()

  const focus = useMemo(() => {
    const chrono = computeChronotype(sleepRecords.map((s) => ({ date: s.date, bedtime: s.bedtime, duration: s.duration })))
    const curve = computeEnergyCurve(selfMetrics.filter((m) => m.category === 'energy').map((m) => ({ value: m.value, timestamp: m.timestamp })))
    return computeFocusWindow(curve, chrono)
  }, [sleepRecords, selfMetrics])

  if (!focus.sufficient || !focus.message) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-1.5">
        <div className="flex items-center gap-2">
          <Crosshair size={14} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Ventana de foco</h2>
        </div>
        <p className="text-[13px] text-foreground/90 leading-relaxed">{focus.message}</p>
      </CardContent>
    </Card>
  )
}
