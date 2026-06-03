'use client'
// SIR V2 — TrackerStrip: lee del store los trackers enganchados a un objetivo o
// a un paso/KR/tarea y renderiza sus resúmenes compactos (TrackerSummary). Si no
// hay ninguno, no renderiza nada (cero ruido en items sin tracker).
//
// Es el punto de integración liviano en /objetivos y ObjectiveSteps: una línea
// <TrackerStrip objectiveId=... /> o <TrackerStrip objectiveStepId=... />.

import { useTrackerStore } from '@/stores/useTrackerStore'
import { cn } from '@/lib/utils'
import { TrackerSummary } from './TrackerSummary'

export interface TrackerStripProps {
  /** Mostrar trackers colgados de este objetivo. */
  objectiveId?: string
  /** Mostrar trackers colgados de este paso/KR/tarea. */
  objectiveStepId?: string
  className?: string
}

export function TrackerStrip({ objectiveId, objectiveStepId, className }: TrackerStripProps) {
  const trackers = useTrackerStore((s) => s.trackers)
  const points = useTrackerStore((s) => s.points)

  const matching = trackers.filter((t) =>
    objectiveStepId
      ? t.objectiveStepId === objectiveStepId
      : objectiveId
        ? t.objectiveId === objectiveId && !t.objectiveStepId
        : false,
  )

  if (matching.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {matching.map((t) => (
        <TrackerSummary key={t.id} tracker={t} points={points} />
      ))}
    </div>
  )
}
