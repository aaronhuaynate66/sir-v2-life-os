'use client'

// SIR V2 — /horario · vista MES.
//
// Overview de carga del mes: BRIEF del mes (resumen de alto nivel + narrativa IA
// on-demand) → hitos y deadlines (target dates de objetivos, deadlines de tareas
// OKR, y fechas de la red) agrupados por proximidad. Una lectura de "qué se
// viene" para planear el mes, no el calendario crudo.

import { useMemo } from 'react'
import { CalendarRange } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { HORIZON_WINDOW_DAYS, type CockpitMilestone } from '@/lib/horario/cockpit'
import type { YearAnchor } from '@/lib/year-compass/build'
import {
  buildMonthBriefSignals,
  monthSummaryLine,
  hasMonthContent,
  periodStartKey,
  periodEndKey,
  type MonthBriefAnchor,
} from '@/lib/horario/briefPeriod'
import { BriefPanel } from './BriefPanel'
import { MilestoneRow, EmptyNote } from './parts'

interface Group {
  label: string
  items: CockpitMilestone[]
}

/** Agrupa por proximidad. Presentación pura (la fusión ya viene ordenada). */
function groupByProximity(milestones: CockpitMilestone[]): Group[] {
  const buckets: Group[] = [
    { label: 'Vencidos', items: [] },
    { label: 'Esta semana', items: [] },
    { label: 'En dos semanas', items: [] },
    { label: 'Más adelante', items: [] },
  ]
  for (const m of milestones) {
    if (m.daysUntil < 0) buckets[0].items.push(m)
    else if (m.daysUntil <= 6) buckets[1].items.push(m)
    else if (m.daysUntil <= 13) buckets[2].items.push(m)
    else buckets[3].items.push(m)
  }
  return buckets.filter((b) => b.items.length > 0)
}

function summarize(milestones: CockpitMilestone[]): string {
  const c = { goal_target: 0, step_deadline: 0, date: 0 }
  for (const m of milestones) c[m.kind]++
  const parts: string[] = []
  if (c.goal_target) parts.push(`${c.goal_target} objetivo${c.goal_target === 1 ? '' : 's'}`)
  if (c.step_deadline) parts.push(`${c.step_deadline} deadline${c.step_deadline === 1 ? '' : 's'}`)
  if (c.date) parts.push(`${c.date} fecha${c.date === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/** Aplana el ancla del año (Tu Año) al shape que consume el brief del mes. */
function toBriefAnchor(anchor: YearAnchor | null): MonthBriefAnchor | null {
  if (!anchor) return null
  return { title: anchor.title, subtitle: anchor.subtitle, monthLabel: anchor.monthLabel, daysUntil: anchor.daysUntil }
}

export function MesView({
  milestones,
  anchor,
  nowMs,
}: {
  milestones: CockpitMilestone[]
  anchor: YearAnchor | null
  nowMs: number
}) {
  // Señales del Brief del mes — hitos ya computados + ancla del año.
  const briefSignals = useMemo(
    () =>
      buildMonthBriefSignals({
        monthStart: periodStartKey(nowMs),
        monthEnd: periodEndKey(nowMs, HORIZON_WINDOW_DAYS.mes),
        milestones,
        anchor: toBriefAnchor(anchor),
      }),
    [nowMs, milestones, anchor],
  )
  const briefSummary = useMemo(() => monthSummaryLine(briefSignals), [briefSignals])

  const brief = (
    <BriefPanel
      scope="month"
      bucket={briefSignals.monthStart}
      summary={briefSummary}
      empty={!hasMonthContent(briefSignals)}
      signals={briefSignals as unknown as Record<string, unknown>}
    />
  )

  if (milestones.length === 0) {
    return (
      <div className="space-y-5">
        {brief}
        <EmptyNote>Sin hitos ni deadlines en el próximo mes. Mes despejado. 🌤️</EmptyNote>
      </div>
    )
  }

  const groups = groupByProximity(milestones)

  return (
    <div className="space-y-5">
      {/* Brief del mes — resumen de alto nivel arriba de todo */}
      {brief}

      {/* Carga del mes */}
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5 flex items-center gap-3">
          <CalendarRange size={18} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-hidden="true" />
          <div>
            <div className="text-sm text-foreground">
              {milestones.length} hito{milestones.length === 1 ? '' : 's'} en el próximo mes
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{summarize(milestones)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Hitos agrupados por proximidad */}
      {groups.map((g) => (
        <Card key={g.label} className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{g.label}</div>
              <span className="text-[11px] font-mono tabular-nums text-text-tertiary">{g.items.length}</span>
            </div>
            <ul className="space-y-0.5">
              {g.items.map((m) => (
                <li key={m.id}>
                  <MilestoneRow milestone={m} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
