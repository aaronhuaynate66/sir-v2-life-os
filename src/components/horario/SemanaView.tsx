'use client'

// SIR V2 — /horario · vista SEMANA.
//
// La semana operativa: BRIEF de la semana (resumen escaneable + narrativa IA
// on-demand) → FOCO (1–3 KRs más urgentes/prioritarios) → los 7 días (hoy..+6)
// con eventos del calendario + tareas OKR que vencen → FECHAS de la red con
// aviso anticipado (cumple/aniversario + empujón accionable).

import { useMemo } from 'react'
import { CalendarHeart, MapPin, Target } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { HORIZON_WINDOW_DAYS, type CockpitDate, type CockpitDayBucket, type FocusKR } from '@/lib/horario/cockpit'
import {
  buildWeekBriefSignals,
  weekSummaryLine,
  hasWeekContent,
  periodStartKey,
  periodEndKey,
} from '@/lib/horario/briefPeriod'
import { BriefPanel } from './BriefPanel'
import { BrainGlow } from './BrainGlow'
import { DateRow, FocusRow, TaskRow, CalendarHint, limaTime, dayLabel } from './parts'

export function SemanaView({
  focus,
  weekDays,
  contactDates,
  configured,
  nowMs,
}: {
  focus: FocusKR[]
  weekDays: CockpitDayBucket[]
  contactDates: CockpitDate[]
  configured: boolean
  nowMs: number
}) {
  const empty =
    focus.length === 0 &&
    contactDates.length === 0 &&
    weekDays.every((d) => d.events.length === 0 && d.tasks.length === 0)

  // Señales del Brief de la semana — agregados ya computados; el modelo reformula.
  const briefSignals = useMemo(
    () =>
      buildWeekBriefSignals({
        weekStart: periodStartKey(nowMs),
        weekEnd: periodEndKey(nowMs, HORIZON_WINDOW_DAYS.semana),
        weekDays,
        focus,
        contactDates,
      }),
    [nowMs, weekDays, focus, contactDates],
  )
  const briefSummary = useMemo(() => weekSummaryLine(briefSignals), [briefSignals])

  return (
    <div className="space-y-5">
      {/* Brief de la semana — resumen escaneable arriba de todo */}
      <BriefPanel
        scope="week"
        bucket={briefSignals.weekStart}
        summary={briefSummary}
        empty={!hasWeekContent(briefSignals)}
        signals={briefSignals as unknown as Record<string, unknown>}
      />

      {/* Cerebro · surfacing (F4) — semilla filtrada por proximos 7 dias */}
      <BrainGlow scope="week" />

      {/* Foco de la semana */}
      {focus.length > 0 && (
        <Card className="shadow-none border-brand/30 bg-brand-soft/40">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target size={13} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
              <span className="text-[11px] uppercase tracking-[0.07em] text-brand-soft-foreground">Foco de la semana</span>
            </div>
            <ul className="space-y-0.5">
              {focus.map((kr) => (
                <li key={kr.id}>
                  <FocusRow kr={kr} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Los 7 días */}
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-6">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-3">La semana</div>
          {!configured && <CalendarHint compact />}
          <ol className="space-y-3">
            {weekDays.map((day) => (
              <DayRow key={day.dateKey} day={day} />
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Fechas de la red */}
      {contactDates.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarHeart size={13} strokeWidth={1.75} className="text-brand-soft-foreground" aria-hidden="true" />
              <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Fechas de tu red</span>
              <span className="text-[11px] font-mono tabular-nums text-text-tertiary ml-auto">{contactDates.length}</span>
            </div>
            <ul className="space-y-0.5">
              {contactDates.map((d) => (
                <li key={d.id}>
                  <DateRow date={d} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {empty && (
        <p className="text-sm text-muted-foreground text-center py-4">Semana despejada. 🌤️</p>
      )}
    </div>
  )
}

function DayRow({ day }: { day: CockpitDayBucket }) {
  const isEmpty = day.events.length === 0 && day.tasks.length === 0
  return (
    <li className="flex gap-3">
      <div className="w-20 shrink-0 pt-0.5">
        <div className={cn('text-xs font-medium', day.isToday ? 'text-primary' : 'text-foreground/80')}>
          {dayLabel(day.dateKey, day.offset)}
        </div>
      </div>
      <div className="min-w-0 flex-1 border-l border-border/40 pl-3 pb-1">
        {isEmpty ? (
          <div className="text-xs text-muted-foreground/50 py-0.5">Libre</div>
        ) : (
          <div className="space-y-1">
            {day.events.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                {e.calendarColor ? (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: e.calendarColor }} aria-hidden="true" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-muted-foreground/60" aria-hidden="true" />
                )}
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-11 shrink-0">
                  {e.allDay ? 'todo' : limaTime(e.start)}
                </span>
                <span className="text-foreground/90 truncate">{e.title}</span>
                {e.location && (
                  <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] text-muted-foreground/60 truncate">
                    <MapPin size={9} strokeWidth={1.75} aria-hidden="true" />
                    {e.location}
                  </span>
                )}
              </div>
            ))}
            {day.tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
