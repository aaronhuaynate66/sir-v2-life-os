'use client'

// SIR V2 — NextStepCard (12·M2 + 12·M3): tu próximo paso, dimensionado.
// Muestra EL siguiente paso accionable (no la lista) y lo achica si tu energía
// del día está baja o el esfuerzo es grande — bajar la fricción de arrancar
// (Fogg). Se oculta si no hay tarea pendiente.

import { useMemo } from 'react'
import { Footprints } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { estaAbierto } from '@/lib/objectives/steps'
import { useGoalStore } from '@/stores/useGoalStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { sizeNextStep } from '@/lib/habits/nextStep'
import { limaDayKey, todayLimaKey } from '@/lib/dates/limaDay'

export function NextStepCard() {
  const steps = useObjectiveStepStore((s) => s.steps)
  const goals = useGoalStore((s) => s.goals)
  const { selfMetrics } = useSelfStore()

  const guidance = useMemo(() => {
    // Próxima TAREA accionable: no hecha, no bloqueada; la de fecha más cercana.
    const actionable = steps
      .filter((s) => s.kind === 'task' && estaAbierto(s) && s.taskStatus !== 'done' && s.taskStatus !== 'blocked')
      .sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'))
    const next = actionable[0]
    if (!next) return null

    // Energía del día (self_metrics 'energy' con timestamp de HOY-Lima).
    const today = todayLimaKey()
    const energyToday = selfMetrics
      .filter((m) => m.category === 'energy' && limaDayKey(m.timestamp) === today)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]

    const goalTitle = goals.find((g) => g.id === next.objectiveId)?.title
    return { g: sizeNextStep({ title: next.title, effort: next.effort, todayEnergy: energyToday?.value ?? null }), goalTitle }
  }, [steps, goals, selfMetrics])

  if (!guidance) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-1.5">
        <div className="flex items-center gap-2">
          <Footprints size={14} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tu próximo paso</h2>
        </div>
        <p className="text-[13px] text-foreground/90 leading-relaxed">{guidance.g.suggestion}</p>
        {guidance.goalTitle && <div className="text-[10px] text-muted-foreground/60">para: {guidance.goalTitle}</div>}
      </CardContent>
    </Card>
  )
}
