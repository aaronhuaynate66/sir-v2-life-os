'use client'

// SIR V2 — /horario · Plan del día (Fase 2, superficie).
//
// Toma las tareas que vencen hoy SIN hora (las de "Vencen hoy") y PROPONE
// meterlas en los huecos libres calculados, respetando la duración por esfuerzo
// (S/M/L). Es una PROPUESTA editable: Aaron revisa, cambia el hueco de cada
// tarea o la deja sin programar, y recién al "Aceptar" cada tarea recibe su
// `due_time` (col 0061) en el hueco elegido → cae al timeline del día. NUNCA se
// asigna hora en silencio.
//
// Toda la matemática (qué hueco, a qué hora, overflow) es pura y vive en
// lib/horario/dayPlanProposal; acá sólo está la UI + la persistencia (updateStep,
// que sincroniza target_date + due_time a Supabase).

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarPlus, Clock, AlertTriangle, Check } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CockpitTask } from '@/lib/horario/cockpit'
import type { GapRowItem } from '@/lib/horario/dayPlan'
import {
  greedyAssign,
  layoutPlan,
  taskMinutes,
  type PlanAssignments,
  type PlanSlot,
} from '@/lib/horario/dayPlanProposal'
import { msToLimaHHMM, formatDurationMin } from '@/lib/horario/limaClock'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'

const NONE = 'none'

function gapLabel(g: GapRowItem): string {
  return `${msToLimaHHMM(g.startMs)}–${msToLimaHHMM(g.endMs)} · ${formatDurationMin(g.minutes)}`
}

function effortLabel(task: CockpitTask): string {
  const min = taskMinutes(task)
  return task.effort ? `${task.effort} · ${formatDurationMin(min)}` : formatDurationMin(min)
}

export function PlanDelDiaPanel({
  untimedTasks,
  gaps,
  dateKey,
}: {
  untimedTasks: CockpitTask[]
  gaps: GapRowItem[]
  dateKey: string
}) {
  const updateStep = useObjectiveStepStore((s) => s.updateStep)
  const [proposed, setProposed] = useState(false)
  const [assignments, setAssignments] = useState<PlanAssignments>({})
  const [appliedCount, setAppliedCount] = useState<number | null>(null)

  const { slots, slotByTask } = useMemo(() => {
    const layout = layoutPlan(untimedTasks, gaps, assignments)
    const map = new Map<string, PlanSlot>(layout.slots.map((s) => [s.task.id, s]))
    return { slots: layout.slots, slotByTask: map }
  }, [untimedTasks, gaps, assignments])

  const noGaps = gaps.length === 0
  const hasOverdue = untimedTasks.some((t) => t.overdue && slotByTask.has(t.id))

  function propose() {
    setAssignments(greedyAssign(untimedTasks, gaps))
    setProposed(true)
    setAppliedCount(null)
  }

  function setGap(taskId: string, value: string) {
    setAssignments((prev) => ({ ...prev, [taskId]: value === NONE ? null : value }))
  }

  function accept() {
    if (slots.length === 0) return
    for (const s of slots) {
      // target_date = HOY (Lima) + due_time del hueco → cae al timeline. Para una
      // tarea vencida esto la reprograma para hoy; es explícito (Aaron aceptó).
      updateStep(s.task.stepId, { targetDate: dateKey, dueTime: s.dueTime })
    }
    setAppliedCount(slots.length)
    setProposed(false)
    toast.success(`${slots.length} tarea${slots.length === 1 ? '' : 's'} programada${slots.length === 1 ? '' : 's'}`, {
      description: 'Ya aparecen en la línea del día.',
    })
  }

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <CalendarPlus size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Plan del día</div>
        </div>

        {appliedCount !== null && !proposed ? (
          <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
            <Check size={14} strokeWidth={2} className="text-ok shrink-0" aria-hidden="true" />
            Listo: programé {appliedCount} en tu día. Ajustá horas en{' '}
            <span className="text-foreground/80">/objetivos</span> si hace falta.
          </p>
        ) : noGaps ? (
          <p className="text-sm text-muted-foreground mt-2">
            No hay huecos libres hoy para encajar tus tareas. Liberá un bloque y volvé a intentar.
          </p>
        ) : !proposed ? (
          <>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              {untimedTasks.length} tarea{untimedTasks.length === 1 ? '' : 's'} sin hora · {gaps.length} hueco
              {gaps.length === 1 ? '' : 's'} libre{gaps.length === 1 ? '' : 's'}. Te propongo un orden y vos lo ajustás.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={propose}
              className="h-8 text-xs border-brand/30 bg-brand-soft text-brand-soft-foreground hover:bg-brand/15"
            >
              <CalendarPlus size={13} strokeWidth={1.75} className="mr-1.5" />
              Proponer plan del día
            </Button>
          </>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground mt-1 mb-3">
              Propuesta — revisá el hueco de cada tarea y aceptá. Nada se programa hasta que confirmes.
            </p>
            <ul className="space-y-2">
              {untimedTasks.map((task) => {
                const slot = slotByTask.get(task.id)
                const value = assignments[task.id] ?? NONE
                return (
                  <li
                    key={task.id}
                    className="rounded-md border border-border bg-secondary/40 p-2.5 flex items-center gap-3 flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {task.priority === 'high' && (
                          <span className="text-brand-soft-foreground text-[10px]" title="Prioridad alta" aria-hidden="true">
                            ●
                          </span>
                        )}
                        <span className="text-sm text-foreground truncate">{task.title}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {task.objectiveTitle} · {effortLabel(task)}
                        {task.overdue && <span className="text-bad"> · vencida</span>}
                      </div>
                    </div>

                    {slot && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-mono tabular-nums shrink-0',
                          slot.overflow ? 'text-warn' : 'text-foreground',
                        )}
                        title={slot.overflow ? 'Se pasa del final del hueco' : undefined}
                      >
                        {slot.overflow ? (
                          <AlertTriangle size={11} strokeWidth={1.75} aria-hidden="true" />
                        ) : (
                          <Clock size={11} strokeWidth={1.75} className="text-muted-foreground" aria-hidden="true" />
                        )}
                        {slot.dueTime}
                      </span>
                    )}

                    <Select value={value} onValueChange={(v) => setGap(task.id, v)}>
                      <SelectTrigger className="h-8 w-full sm:w-[170px] text-xs bg-card sm:shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE} className="text-xs">
                          No programar
                        </SelectItem>
                        {gaps.map((g) => (
                          <SelectItem key={g.key} value={g.key} className="text-xs">
                            {gapLabel(g)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                )
              })}
            </ul>

            {hasOverdue && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Las tareas vencidas que programes se reprograman para hoy.
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={accept} disabled={slots.length === 0} className="h-8 text-xs">
                <Check size={13} strokeWidth={2} className="mr-1.5" />
                Aceptar plan ({slots.length})
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setProposed(false)} className="h-8 text-xs text-muted-foreground">
                Cancelar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
