'use client'

// SIR V2 — /horario · vista DÍA.
//
// /horario cuenta UNA historia: CÓMO SE VE TU TIEMPO. La vista Día abre con el
// día hora por hora — AHORA/PRÓXIMO (countdown en vivo) → línea de tiempo del
// calendario con las tareas OKR que vencen hoy → y el estado físico queda
// PLEGADO al final (contexto, no protagonista; vive en /yo). Las relaciones que
// requieren acción ("Hoy con tu gente") se mudaron a /agenda — acá no van.

import { useMemo } from 'react'
import { CalendarDays, Flame, ListChecks, MapPin } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DayTimeline, TimelineBlock, OverloadLevel } from '@/lib/calendar/timeline'
import type { CockpitDate, CockpitTask } from '@/lib/horario/cockpit'
import { buildDayPlan, type GapRowItem, type TaskRowItem } from '@/lib/horario/dayPlan'
import { buildBriefSignals, briefSummaryLine, hasBriefContent } from '@/lib/horario/brief'
import type { PhysicalState } from '@/lib/horario/physical'
import { BriefPanel } from './BriefPanel'
import { BrainGlow } from './BrainGlow'
import { PlanDelDiaPanel } from './PlanDelDiaPanel'
import {
  DayContextStrip,
  TaskRow,
  CalendarHint,
  EmptyNote,
  limaTime,
  limaTimeMs,
  formatGapDuration,
  formatCountdown,
} from './parts'

const OVERLOAD_STYLE: Record<OverloadLevel, { text: string; border: string; bg: string }> = {
  ok: { text: 'text-ok', border: 'border-ok/30', bg: 'bg-ok-soft' },
  busy: { text: 'text-warn', border: 'border-warn/30', bg: 'bg-warn-soft' },
  overloaded: { text: 'text-bad', border: 'border-bad/30', bg: 'bg-bad-soft' },
}

export function DiaView({
  timeline,
  tasksToday,
  contactDates,
  physical,
  nowMs,
  configured,
  calendarError,
  calendars,
}: {
  timeline: DayTimeline
  tasksToday: CockpitTask[]
  contactDates: CockpitDate[]
  physical: PhysicalState
  nowMs: number
  configured: boolean
  calendarError: boolean
  calendars: { id: string; label: string; color?: string }[]
}) {
  const o = OVERLOAD_STYLE[timeline.overload.level]
  const legend = calendars.filter((c) => c.label)
  const showLegend = legend.length > 1

  // Plan del día: eventos del calendario + tareas con hora fusionadas + huecos
  // libres en un solo eje. Las tareas de hoy SIN hora quedan para "Vencen hoy".
  const plan = useMemo(() => buildDayPlan(timeline, tasksToday, nowMs), [timeline, tasksToday, nowMs])
  const hasTimedRows = plan.rows.some((r) => r.type !== 'gap')
  const hasCalendar = hasTimedRows || timeline.allDay.length > 0

  // Huecos libres del plan (para el "Plan del día" — slotting de tareas sin hora).
  const gaps = useMemo(() => plan.rows.filter((r): r is GapRowItem => r.type === 'gap'), [plan])

  // Señales del Brief del día — hechos ya computados; el modelo sólo reformula.
  const briefSignals = useMemo(
    () => buildBriefSignals({ timeline, plan, contactDates }),
    [timeline, plan, contactDates],
  )
  const briefSummary = useMemo(() => briefSummaryLine(briefSignals), [briefSignals])

  return (
    <div className="space-y-5">
      {/* Brief del día — resumen escaneable arriba de todo */}
      <BriefPanel
        scope="day"
        bucket={briefSignals.date}
        summary={briefSummary}
        empty={!hasBriefContent(briefSignals)}
        signals={briefSignals as unknown as Record<string, unknown>}
        enrichRelations
      />

      {/* Cerebro · surfacing (F4). Panel discreto; se autoculta si no hay nada. */}
      <BrainGlow />

      {/* All-day: marco del día */}
      {timeline.allDay.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {timeline.allDay.map((e) => (
            <Badge key={e.id} variant="brand" className="text-[11px] font-normal">
              <CalendarDays size={11} strokeWidth={1.75} className="mr-1" aria-hidden="true" />
              {e.title}
            </Badge>
          ))}
        </div>
      )}

      {/* AHORA / PRÓXIMO — qué pasa ahora y qué sigue */}
      <NowNext timeline={timeline} nowMs={nowMs} />

      {/* Sobrecarga del día */}
      {timeline.overload.level !== 'ok' && (
        <Card className={cn('shadow-none', o.border, o.bg)}>
          <CardContent className="p-4 flex items-center gap-3">
            <Flame size={16} strokeWidth={1.75} className={cn('flex-shrink-0', o.text)} aria-hidden="true" />
            <span className="text-sm text-foreground/90">{timeline.overload.reason}</span>
          </CardContent>
        </Card>
      )}

      {/* Leyenda multi-calendario */}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {legend.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color ?? 'var(--brand)' }} aria-hidden="true" />
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* Línea de tiempo del día — calendario + tareas con hora + huecos libres */}
      {!configured ? (
        <CalendarHint />
      ) : calendarError && !hasCalendar ? (
        <EmptyNote tone="warn">No pude leer el feed del calendario.</EmptyNote>
      ) : !hasTimedRows ? (
        <EmptyNote>Sin eventos ni tareas con hora hoy. 🌤️</EmptyNote>
      ) : (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-6">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-3">El día</div>
            <ol className="space-y-0.5">
              {plan.rows.map((row) => {
                if (row.type === 'event') return <BlockRow key={row.key} block={row.block} nowMs={nowMs} />
                if (row.type === 'task') return <TaskBlockRow key={row.key} row={row} nowMs={nowMs} />
                return <GapRow key={row.key} row={row} />
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Tareas OKR que vencen hoy SIN hora (las que tienen hora ya están arriba) */}
      {plan.untimedTasks.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Vencen hoy</div>
              <span className="text-[11px] font-mono tabular-nums text-text-tertiary">{plan.untimedTasks.length}</span>
            </div>
            <ul className="space-y-0.5">
              {plan.untimedTasks.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Plan del día — propone meter las tareas sin hora en los huecos libres */}
      {plan.untimedTasks.length > 0 && (
        <PlanDelDiaPanel untimedTasks={plan.untimedTasks} gaps={gaps} dateKey={timeline.dateKey} />
      )}

      {/* Contexto físico del día — PLEGADO y al final (vive en /yo) */}
      <DayContextStrip state={physical} />
    </div>
  )
}

function NowNext({ timeline, nowMs }: { timeline: DayTimeline; nowMs: number }) {
  const { current, next } = timeline
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* AHORA */}
      <Card className={cn('shadow-none', current ? 'border-primary/40 bg-primary/[0.05]' : '')}>
        <CardContent className="p-4 sm:p-5">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">Ahora</div>
          {current ? (
            <>
              <div className="text-lg font-semibold tracking-tight leading-tight">{current.event.title}</div>
              <div className="text-xs text-muted-foreground mt-1 font-mono tabular-nums">
                {limaTime(current.event.start)}{current.event.end ? `–${limaTime(current.event.end)}` : ''}
              </div>
              {current.event.location && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                  <MapPin size={10} strokeWidth={1.75} className="text-muted-foreground/50" aria-hidden="true" />
                  <span className="truncate">{current.event.location}</span>
                </div>
              )}
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">termina en</span>
                <span className="text-base font-mono tabular-nums text-primary">{formatCountdown(current.endMs - nowMs)}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-2">Sin bloque activo. Espacio libre.</div>
          )}
        </CardContent>
      </Card>

      {/* PRÓXIMO */}
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">Próximo</div>
          {next ? (
            <>
              <div className="text-lg font-semibold tracking-tight leading-tight">{next.event.title}</div>
              <div className="text-xs text-muted-foreground mt-1 font-mono tabular-nums">
                {limaTime(next.event.start)}{next.event.end ? `–${limaTime(next.event.end)}` : ''}
              </div>
              {next.event.location && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                  <MapPin size={10} strokeWidth={1.75} className="text-muted-foreground/50" aria-hidden="true" />
                  <span className="truncate">{next.event.location}</span>
                </div>
              )}
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">empieza en</span>
                <span className="text-base font-mono tabular-nums text-foreground">{formatCountdown(next.startMs - nowMs)}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-2">Nada más por hoy. 🌙</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BlockRow({ block, nowMs }: { block: TimelineBlock; nowMs: number }) {
  const isPast = block.status === 'past'
  const isCurrent = block.status === 'current'
  return (
    <li className={cn('flex items-center gap-3 py-2 border-b border-border/40 last:border-0', isPast && 'opacity-40')}>
      <div className="w-14 flex-shrink-0 text-xs font-mono tabular-nums text-muted-foreground">{limaTime(block.event.start)}</div>
      {block.event.calendarColor ? (
        <div
          className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isCurrent && 'animate-pulse')}
          style={{ backgroundColor: block.event.calendarColor }}
          aria-hidden="true"
          title={block.event.calendarLabel}
        />
      ) : (
        <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isCurrent ? 'bg-brand animate-pulse' : isPast ? 'bg-muted-foreground/40' : 'bg-muted-foreground/70')} aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm truncate', isCurrent ? 'text-foreground font-medium' : 'text-foreground/90')}>{block.event.title}</div>
        {block.event.location && <div className="text-[11px] text-muted-foreground truncate">{block.event.location}</div>}
      </div>
      {isCurrent && (
        <Badge variant="outline" className="text-[10px] font-mono border-primary/30 bg-primary/10 text-primary flex-shrink-0">
          {formatCountdown(block.endMs - nowMs)}
        </Badge>
      )}
    </li>
  )
}

/** Tarea OKR con hora, en la línea del día. Acento de marca (violeta) + ícono de
 *  tarea para distinguirla de un evento del calendario, en el mismo eje horario. */
function TaskBlockRow({ row, nowMs }: { row: TaskRowItem; nowMs: number }) {
  const { task } = row
  const isPast = row.status === 'past'
  const isCurrent = row.status === 'current'
  return (
    <li className={cn('flex items-center gap-3 py-2 border-b border-border/40 last:border-0', isPast && 'opacity-40')}>
      <div className="w-14 flex-shrink-0 text-xs font-mono tabular-nums text-muted-foreground">{limaTimeMs(row.startMs)}</div>
      <ListChecks
        size={14}
        strokeWidth={1.75}
        className={cn('flex-shrink-0', isCurrent ? 'text-brand animate-pulse' : 'text-brand-soft-foreground')}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.priority === 'high' && (
            <span className="text-brand-soft-foreground text-[10px]" title="Prioridad alta" aria-hidden="true">
              ●
            </span>
          )}
          <span className={cn('text-sm truncate', isCurrent ? 'text-foreground font-medium' : 'text-foreground/90')}>{task.title}</span>
        </div>
        <div className="text-[11px] text-brand-soft-foreground truncate">{task.objectiveTitle} · tarea</div>
      </div>
    </li>
  )
}

/** Hueco libre entre bloques ocupados: separador tenue con duración. */
function GapRow({ row }: { row: GapRowItem }) {
  return (
    <li className={cn('flex items-center gap-3 py-1.5 text-muted-foreground/60', row.status === 'past' && 'opacity-40')}>
      <div className="w-14 flex-shrink-0 text-xs font-mono tabular-nums text-muted-foreground/60">{limaTimeMs(row.startMs)}</div>
      <div className="h-px flex-1 border-t border-dashed border-border/60" aria-hidden="true" />
      <span className="text-[11px] whitespace-nowrap">
        libre hasta {limaTimeMs(row.endMs)} · {formatGapDuration(row.minutes)}
      </span>
    </li>
  )
}
