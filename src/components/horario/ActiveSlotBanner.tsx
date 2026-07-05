'use client'

// SIR V2 — 12·M1: banner "Ahora" en /horario. Cuando el reloj entra en la franja
// de una tarea con hora que vence hoy, muestra el recordatorio activo (Fogg: el
// Prompt atado a una señal temporal). Se re-evalúa solo cada minuto. Invisible si
// no hay ninguna franja activa.
import { useEffect, useMemo, useState } from 'react'
import { Zap, Check } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { activeSlotPrompt, type SlotTask } from '@/lib/habits/activeSlot'
import type { ObjectiveStep } from '@/types'

export function ActiveSlotBanner({
  steps,
  onComplete,
}: {
  steps: ObjectiveStep[]
  onComplete?: (stepId: string) => void
}) {
  const [nowMs, setNowMs] = useState<number | null>(null)

  useEffect(() => {
    setNowMs(Date.now())
    const id = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const slotTasks = useMemo<SlotTask[]>(
    () =>
      steps
        .filter((s) => s.kind === 'task' && !!s.dueTime && !!s.targetDate)
        .map((s) => ({
          id: s.id,
          title: s.title,
          dueTime: s.dueTime,
          targetDate: s.targetDate,
          effort: s.effort,
          done: s.status === 'hecho',
        })),
    [steps],
  )

  const prompt = useMemo(() => (nowMs == null ? null : activeSlotPrompt(slotTasks, nowMs)), [slotTasks, nowMs])
  if (!prompt) return null

  return (
    <Card className="mb-4 border-primary/40 bg-primary/[0.04]">
      <CardContent className="p-4 sm:p-5 flex items-center gap-3">
        <Zap size={18} strokeWidth={1.75} className="text-primary shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-0.5">
            {prompt.imminent ? 'En tu agenda, en breve' : 'Es el momento'}
          </div>
          <p className="text-sm font-medium text-foreground truncate">{prompt.text}</p>
        </div>
        {onComplete && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onComplete(prompt.taskId)}
            className="shrink-0 inline-flex items-center gap-1.5"
          >
            <Check size={14} strokeWidth={2} aria-hidden="true" /> Hecho
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
