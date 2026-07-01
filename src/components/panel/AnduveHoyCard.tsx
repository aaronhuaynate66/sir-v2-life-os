'use client'

// SIR V2 — "Anduve hoy": timeline compacto de eventos registrados hoy
// (Mission Control · /panel). Refleja, no evalúa.
//
// Aaron abre /panel al final del día y ve una lista corta cronológica
// de lo que SIR registró que hizo: hábitos marcados, self-metrics,
// sueño, gastos, KRs/tareas cerradas, memorias nuevas. Sin score,
// sin juicio, sin métrica agregada — solo el hecho.
//
// Fail-safe: si no hay eventos del día, no renderiza (opción B) o
// muestra un empty state calmado (opción A — la que va). Preferimos
// empty state porque el ritual de "voy a ver anduve hoy" es más
// importante que la vergüenza de "no hice nada".

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, ChevronDown, Sparkles, Wallet, Moon, CheckCircle2, Target, NotebookPen, BookOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSelfStore } from '@/stores/useSelfStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useMemoryStore } from '@/stores'
import { buildAnduveTimeline, type AnduveEvent, type AnduveEventKind } from '@/lib/panel/anduveHoy'
import { cn } from '@/lib/utils'

const KIND_ICON: Record<AnduveEventKind, LucideIcon> = {
  habit: CheckCircle2,
  metric: Activity,
  sleep: Moon,
  finance: Wallet,
  kr_done: Target,
  task_done: CheckCircle2,
  goal_touched: Target,
  person_note: NotebookPen,
  capture: Sparkles,
  memory_new: BookOpen,
}

const INITIAL_VISIBLE = 5

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso.slice(11, 16)
  }
}

interface AnduveHoyCardProps {
  now?: Date | null
}

export function AnduveHoyCard({ now }: AnduveHoyCardProps = {}) {
  const selfMetrics = useSelfStore((s) => s.selfMetrics)
  const sleepRecords = useSelfStore((s) => s.sleepRecords)
  const people = useRelationshipStore((s) => s.people)
  const goals = useGoalStore((s) => s.goals)
  const objectiveSteps = useObjectiveStepStore((s) => s.steps)
  const financialMovements = useFinanceStore((s) => s.financialMovements)
  const memories = useMemoryStore((s) => s.memories)

  const [showAll, setShowAll] = useState(false)

  const events = useMemo(() => {
    if (!now) return []
    return buildAnduveTimeline({
      now,
      goals,
      people,
      objectiveSteps,
      selfMetrics,
      sleepRecords,
      financialMovements,
      memories,
    })
  }, [now, goals, people, objectiveSteps, selfMetrics, sleepRecords, financialMovements, memories])

  const visible = showAll ? events : events.slice(0, INITIAL_VISIBLE)

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
                Anduve hoy
              </span>
              {events.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-mono">{events.length}</Badge>
              )}
            </div>
          </div>

          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Todavía no registré nada tuyo hoy. Marcá un hábito, logueá un estado, o anotá algo sobre alguien — todo aparece acá.
            </p>
          ) : (
            <>
              <ol className="relative space-y-2 border-l border-border/50 pl-4">
                {visible.map((e) => {
                  const Icon = KIND_ICON[e.kind]
                  return (
                    <li key={e.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[1.30rem] top-1.5 w-1.5 h-1.5 rounded-full',
                          e.kind === 'kr_done' || e.kind === 'task_done'
                            ? 'bg-ok/70'
                            : e.kind === 'finance'
                              ? 'bg-warn/60'
                              : e.kind === 'goal_touched'
                                ? 'bg-brand/70'
                                : 'bg-muted-foreground/50',
                        )}
                        aria-hidden="true"
                      />
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon size={11} strokeWidth={1.75} className="text-muted-foreground/70 flex-shrink-0" aria-hidden="true" />
                          <span className="text-sm text-foreground truncate">{e.label}</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0 tabular-nums">
                          {formatTime(e.at)}
                        </span>
                      </div>
                      {e.meta && (
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 ml-4">{e.meta}</p>
                      )}
                    </li>
                  )
                })}
              </ol>
              {events.length > INITIAL_VISIBLE && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-3 w-full inline-flex items-center justify-center gap-1 py-1.5 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors font-sans"
                >
                  <ChevronDown size={12} strokeWidth={2} className={cn('transition-transform', showAll && 'rotate-180')} />
                  {showAll ? 'Ver menos' : `Ver todos (${events.length})`}
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
