'use client'

// SIR V2 — Strip 18·M5: calendario macro en /horario. Corre el motor PURO
// buildMacroCalendar (feriados de Perú + quincena/fin de mes) con tus objetivos
// personales, y muestra ventanas accionables. Invisible si no hay nada por venir.
import { useMemo } from 'react'
import { CalendarRange, Wallet } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { buildMacroCalendar, type MacroHit } from '@/lib/external/macroCalendar'
import { PERU_HOLIDAYS } from '@/data/peruHolidays'
import type { Goal } from '@/types'

// Objetivos que "encajan" con un finde largo: tiempo personal, no laboral.
const DOWNTIME_CATS = new Set(['personal', 'relational', 'health', 'spiritual', 'creative'])

function personalGoalTitles(goals: Goal[]): string[] {
  const active = goals.filter((g) => g.status === 'active')
  const anchor = active.filter((g) => g.isAnchor)
  const downtime = active.filter((g) => DOWNTIME_CATS.has(g.category) && !g.isAnchor)
  return [...anchor, ...downtime].map((g) => g.title)
}

function whenLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'hoy'
  if (daysUntil === 1) return 'mañana'
  return `en ${daysUntil} días`
}

export function MacroCalendarStrip({ goals, now }: { goals: Goal[]; now: Date | null }) {
  const nowMs = now ? now.getTime() : null
  const hits = useMemo<MacroHit[]>(() => {
    if (nowMs == null) return []
    return buildMacroCalendar({ holidays: PERU_HOLIDAYS, personalGoals: personalGoalTitles(goals) }, new Date(nowMs))
  }, [goals, nowMs])

  if (hits.length === 0) return null

  return (
    <div className="mt-8 space-y-3">
      <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">En el calendario macro</div>
      {hits.map((h) => (
        <Card key={h.id} className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              {h.kind === 'long_weekend' ? (
                <CalendarRange size={16} strokeWidth={1.75} className="text-primary mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <Wallet size={16} strokeWidth={1.75} className="text-muted-foreground/70 mt-0.5 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {h.title} <span className="text-muted-foreground font-normal">· {whenLabel(h.daysUntil)}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{h.hint}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
