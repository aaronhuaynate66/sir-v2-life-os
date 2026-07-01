'use client'

// SIR V2 — Semana en foco (Mission Control).
//
// Card fija que aparece SOLO cuando hay un objetivo activo con targetDate en
// los próximos ~14 días. El caso que la motivó: la mudanza a casa de la tía
// Marita (sáb 4 jul 2026) — el goal + KRs ya vivían en el store, pero /panel
// no los levantaba como cockpit operativo.
//
// La card muestra:
//   - Eyebrow: "SEMANA EN FOCO" (o "TU NORTE" si el goal es el ancla del año)
//   - Countdown grande: "EN 3 DÍAS" / "HOY" / "AYER" / "MAÑANA"
//   - Título + fecha del target
//   - Lista de KRs con checkbox inline (click → updateStep status='hecho')
//   - Progreso X/Y + link a /objetivos?goal=<id>
//
// No es una app nueva: es un lente sobre goals + steps + updateStep que ya
// existen. Cero migración, cero red, todo client-side. Fail-safe: si no hay
// goal en la ventana, no renderiza (return null).

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Anchor, Target, ChevronRight, Check } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { buildWeekFocus, countdownLabel, pickWeekFocusGoal } from '@/lib/panel/weekInFocus'
import { cn } from '@/lib/utils'

interface WeekInFocusCardProps {
  /** `now` inyectable (tests). Producción usa el reloj real. */
  now?: Date | null
}

export function WeekInFocusCard({ now }: WeekInFocusCardProps = {}) {
  const goals = useGoalStore((s) => s.goals)
  const steps = useObjectiveStepStore((s) => s.steps)
  const updateStep = useObjectiveStepStore((s) => s.updateStep)

  // Optimistic checks locales: al tildar un KR, arrancamos la persistencia y
  // reflejamos el cambio de una vez para que la card no espere el round-trip
  // Zustand → subscriber → re-render.
  const [pendingDone, setPendingDone] = useState<Record<string, boolean>>({})

  const focus = useMemo(() => {
    const n = now ?? new Date()
    const goal = pickWeekFocusGoal(goals, n)
    if (!goal) return null
    return buildWeekFocus(goal, steps, n)
  }, [now, goals, steps])

  if (!focus) return null

  const { goal, daysUntil, targetDate, krs, krProgress, isAnchor } = focus
  const urgent = daysUntil >= 0 && daysUntil <= 3
  const overdue = daysUntil < 0

  function toggleKr(id: string, current: boolean) {
    if (current) return // Solo un camino: pendiente → hecho. Deshacer va a /objetivos.
    setPendingDone((prev) => ({ ...prev, [id]: true }))
    updateStep(id, { status: 'hecho' })
  }

  const doneEffective = krProgress.done + Object.values(pendingDone).filter(Boolean).length
  const progressPct = krProgress.total === 0 ? 0 : Math.round((doneEffective / krProgress.total) * 100)
  const Icon = isAnchor ? Anchor : Target
  const label = isAnchor ? 'Tu norte' : 'Semana en foco'
  const countdownColor = urgent ? 'text-warn' : overdue ? 'text-bad' : 'text-foreground'

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <Card className="shadow-none border-border-strong">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Icon size={14} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
                {label}
              </span>
              {urgent && (
                <Badge variant="outline" className="text-[9px] font-mono tracking-widest border-warn/40 bg-warn-soft text-warn ml-1">
                  URGENTE
                </Badge>
              )}
              {overdue && (
                <Badge variant="outline" className="text-[9px] font-mono tracking-widest border-bad/40 bg-bad-soft text-bad ml-1">
                  VENCIDO
                </Badge>
              )}
            </div>
            <div className={cn('text-xs font-mono tracking-widest tabular-nums', countdownColor)}>
              {countdownLabel(daysUntil)}
            </div>
          </div>

          <Link href={`/objetivos?goal=${goal.id}`} className="block group">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight leading-tight group-hover:text-brand-soft-foreground transition-colors">
              {goal.title}
            </h2>
            {goal.target && (
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans mr-2">Target</span>
                {goal.target}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground/70 font-mono">
              <span>{formatTargetDate(targetDate)}</span>
              <span className="opacity-60" aria-hidden="true">·</span>
              <span className="tabular-nums">{doneEffective}/{krProgress.total} KRs</span>
              <span className="opacity-60" aria-hidden="true">·</span>
              <span className="tabular-nums">{progressPct}%</span>
            </div>
          </Link>

          {krs.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {krs.map((k) => {
                const isDone = k.done || pendingDone[k.id] === true
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => toggleKr(k.id, isDone)}
                    disabled={isDone}
                    className={cn(
                      'w-full flex items-start gap-2.5 text-left rounded px-2 py-1.5 min-h-8 group/kr transition-colors',
                      isDone ? 'opacity-60' : 'hover:bg-accent/40',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded border transition-colors',
                        isDone ? 'bg-brand border-brand text-brand-foreground' : 'border-border group-hover/kr:border-brand',
                      )}
                      aria-hidden="true"
                    >
                      {isDone && <Check size={10} strokeWidth={2.5} />}
                    </span>
                    <span className={cn('text-sm leading-relaxed', isDone && 'line-through text-muted-foreground')}>
                      {k.title}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-border/60">
            <Link
              href={`/objetivos?goal=${goal.id}`}
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors font-sans"
            >
              Ver plan completo
              <ChevronRight size={12} strokeWidth={2} />
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

const MON_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DOW_ABBR = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
function formatTargetDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso.slice(0, 10)
  const dt = new Date(y, m - 1, d)
  return `${DOW_ABBR[dt.getDay()]} ${d} ${MON_ABBR[m - 1]}`
}
