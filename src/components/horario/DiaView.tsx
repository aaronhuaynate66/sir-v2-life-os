'use client'

// SIR V2 — /horario · vista DÍA.
//
// El día operativo: estado físico → sobrecarga → AHORA/PRÓXIMO (countdown en
// vivo) → línea de tiempo del calendario, CON las tareas OKR que vencen hoy
// fusionadas arriba. El calendario es una fuente más, no el centro.

import { CalendarDays, Flame, MapPin } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DayTimeline, TimelineBlock, OverloadLevel } from '@/lib/calendar/timeline'
import type { CockpitTask } from '@/lib/horario/cockpit'
import type { PhysicalState } from '@/lib/horario/physical'
import {
  PhysicalStateCard,
  TaskRow,
  CalendarHint,
  EmptyNote,
  limaTime,
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
  physical,
  nowMs,
  configured,
  calendarError,
  calendars,
}: {
  timeline: DayTimeline
  tasksToday: CockpitTask[]
  physical: PhysicalState
  nowMs: number
  configured: boolean
  calendarError: boolean
  calendars: { id: string; label: string; color?: string }[]
}) {
  const o = OVERLOAD_STYLE[timeline.overload.level]
  const legend = calendars.filter((c) => c.label)
  const showLegend = legend.length > 1
  const hasCalendar = timeline.blocks.length > 0 || timeline.allDay.length > 0

  return (
    <div className="space-y-5">
      {/* Estado físico/energía del día */}
      <PhysicalStateCard state={physical} />

      {/* Tareas OKR que vencen hoy (fusión) */}
      {tasksToday.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Vencen hoy</div>
              <span className="text-[11px] font-mono tabular-nums text-text-tertiary">{tasksToday.length}</span>
            </div>
            <ul className="space-y-0.5">
              {tasksToday.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} />
                </li>
              ))}
            </ul>
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

      {/* Sobrecarga */}
      {timeline.overload.level !== 'ok' && (
        <Card className={cn('shadow-none', o.border, o.bg)}>
          <CardContent className="p-4 flex items-center gap-3">
            <Flame size={16} strokeWidth={1.75} className={cn('flex-shrink-0', o.text)} aria-hidden="true" />
            <span className="text-sm text-foreground/90">{timeline.overload.reason}</span>
          </CardContent>
        </Card>
      )}

      {/* All-day */}
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

      {/* AHORA / PRÓXIMO */}
      <NowNext timeline={timeline} nowMs={nowMs} />

      {/* Línea de tiempo del calendario */}
      {!configured ? (
        <CalendarHint />
      ) : calendarError && !hasCalendar ? (
        <EmptyNote tone="warn">No pude leer el feed del calendario.</EmptyNote>
      ) : !hasCalendar ? (
        <EmptyNote>Sin eventos en el calendario hoy. 🌤️</EmptyNote>
      ) : (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-6">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-3">El día</div>
            <ol className="space-y-0.5">
              {timeline.blocks.map((b) => (
                <BlockRow key={b.event.id} block={b} nowMs={nowMs} />
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
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
