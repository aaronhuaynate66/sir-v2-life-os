'use client'

// SIR V2 — FocusWindowStrip (11·M5 → /horario): tu cronotipo, aplicado al día.
//
// El doc 11 pide que la ventana de foco "alimente al planificador de horario".
// Este strip corre los MISMOS motores puros que la card de /salud
// (chronotype + energyCurve + focusWindow) y los baja a una línea de agenda:
// "agenda foco 9–11h; lo mecánico al bajón". Reusa buildPlanningHint (rangos
// contiguos honestos). Invisible si falta data — nada de curvas inventadas.

import { useMemo } from 'react'
import { Sunrise } from 'lucide-react'

import { useSelfStore } from '@/stores/useSelfStore'
import { computeChronotype } from '@/lib/chrono/chronotype'
import { computeEnergyCurve } from '@/lib/chrono/energyCurve'
import { computeFocusWindow } from '@/lib/chrono/focusWindow'
import { buildPlanningHint } from '@/lib/chrono/planningHint'

export function FocusWindowStrip() {
  const { sleepRecords, selfMetrics } = useSelfStore()

  const hint = useMemo(() => {
    const chrono = computeChronotype(sleepRecords.map((s) => ({ date: s.date, bedtime: s.bedtime, duration: s.duration })))
    const curve = computeEnergyCurve(
      selfMetrics.filter((m) => m.category === 'energy').map((m) => ({ value: m.value, timestamp: m.timestamp })),
    )
    const focus = computeFocusWindow(curve, chrono)
    return buildPlanningHint(focus, chrono)
  }, [sleepRecords, selfMetrics])

  if (!hint.sufficient || !hint.headline) return null

  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
      <Sunrise size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tu franja de foco</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-foreground/90">{hint.headline}</p>
      </div>
    </div>
  )
}
