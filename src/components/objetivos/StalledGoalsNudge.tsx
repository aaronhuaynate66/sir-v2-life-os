'use client'

// SIR V2 — Nudge del OBJETIVO ESTANCADO: cierra el loop que la app solo observaba.
// Cuando un objetivo activo lleva ≥14 días sin moverse, SIR no se queda mirando:
// te ofrece la DECISIÓN — retomar (definir el próximo paso), repriorizar, o
// soltar. Se auto-oculta si no hay estancados. Ver lib/goals/stalled.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlarmClock, ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { stalledGoals } from '@/lib/goals/stalled'
import type { Goal, GoalPriority } from '@/types'

const PRIORITY_LABEL: Record<GoalPriority, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja',
}

export function StalledGoalsNudge({
  goals,
  onUpdate,
  onPause,
}: {
  goals: Goal[]
  onUpdate: (id: string, patch: Partial<Goal>) => void
  onPause: (id: string) => void
}) {
  // Mount-safe: daysSinceTouch depende de "ahora" → diferimos a post-mount.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()) }, [])
  const [openId, setOpenId] = useState<string | null>(null)
  const [step, setStep] = useState('')

  if (!now) return null
  const stalled = stalledGoals(goals, now).slice(0, 2) // top 2, no abrumar
  if (stalled.length === 0) return null

  function retomar(id: string) {
    const s = step.trim()
    if (!s) { toast.error('Escribe el próximo paso'); return }
    onUpdate(id, { nextAction: s, updatedAt: new Date().toISOString() })
    setOpenId(null); setStep('')
    toast.success('Retomado', { description: `Próximo paso: ${s}` })
  }
  function repriorizar(id: string, p: GoalPriority) {
    onUpdate(id, { priority: p, updatedAt: new Date().toISOString() })
    toast.success(`Prioridad → ${PRIORITY_LABEL[p]}`)
  }
  function soltar(id: string, title: string) {
    onPause(id)
    toast.success('Lo soltaste por ahora', { description: `"${title}" queda en pausa — puedes retomarlo cuando quieras.` })
  }

  return (
    <Card className="mb-6 border-warn/30">
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <AlarmClock size={16} className="text-warn" />
          <h3 className="text-sm font-semibold">Objetivos que se quedaron quietos</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Llevan tiempo sin moverse. No es un reproche — es un cruce de camino: decide qué haces con cada uno.
        </p>
        <div className="space-y-2.5">
          {stalled.map(({ goal, daysSinceTouch }) => (
            <div key={goal.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {goal.isAnchor && <span className="mr-1 text-brand">★</span>}{goal.title}
                  </div>
                  <div className="text-xs text-muted-foreground">Sin moverse hace {daysSinceTouch} días · {goal.progress}%</div>
                </div>
              </div>
              {openId === goal.id ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Input
                    autoFocus value={step} onChange={(e) => setStep(e.target.value)}
                    placeholder="¿Cuál es el próximo paso?"
                    onKeyDown={(e) => { if (e.key === 'Enter') retomar(goal.id) }}
                    className="h-9 min-w-[180px] flex-1 text-sm"
                  />
                  <Button size="sm" className="h-9" onClick={() => retomar(goal.id)}>Guardar paso</Button>
                  <Button size="sm" variant="ghost" className="h-9" onClick={() => { setOpenId(null); setStep('') }}>Cancelar</Button>
                </div>
              ) : (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Button size="sm" className="h-9" onClick={() => { setOpenId(goal.id); setStep(goal.nextAction || '') }}>
                    Retomar
                  </Button>
                  <Select value={goal.priority} onValueChange={(v) => repriorizar(goal.id, v as GoalPriority)}>
                    <SelectTrigger className="h-9 w-[130px] text-xs">
                      <ChevronDown size={12} className="mr-1" /><SelectValue placeholder="Repriorizar" />
                    </SelectTrigger>
                    <SelectContent>
                      {(['critical', 'high', 'medium', 'low'] as GoalPriority[]).map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">{PRIORITY_LABEL[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="h-9 text-muted-foreground hover:text-foreground" onClick={() => soltar(goal.id, goal.title)}>
                    Soltar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
