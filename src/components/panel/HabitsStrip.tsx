'use client'
// SIR V2 — HabitsStrip: tira de hábitos en Mission Control (Etapa 3).
//
// Hace que los hábitos se vean donde el usuario aterriza cada día: check-in
// rápido del día + racha, sin salir de /panel. Aislado: fetch directo a
// /api/habits, fail-soft (si no hay hábitos o falla, muestra el acceso a /habitos).

import { useCallback, useEffect, useState } from 'react'
import { track, EVENTS } from '@/lib/analytics/track'
import Link from 'next/link'
import { Activity, Flame, Check, Circle, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { postJson } from '@/lib/api/errors'
import { computeHabitStreak, limaDayString } from '@/lib/habits/streak'
import { habitNudge } from '@/lib/habits/nudge'

interface HabitDTO {
  id: string
  title: string
  cadence: 'daily' | 'weekly'
  targetPerPeriod: number
  checkinDates: string[]
}

const TODAY = () => limaDayString(new Date())

export function HabitsStrip() {
  const [habits, setHabits] = useState<HabitDTO[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/habits')
        if (!res.ok) throw new Error('fetch failed')
        const data = (await res.json()) as { habits: HabitDTO[] }
        if (!cancelled) setHabits(data.habits)
      } catch {
        if (!cancelled) {
          setFailed(true)
          setHabits([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = useCallback(
    async (id: string) => {
      if (toggling) return
      setToggling(id)
      try {
        const { done } = await postJson<{ done: boolean }>('/api/habits/checkin', { habit_id: id })
        track(EVENTS.habitChecked, { done })
        const today = TODAY()
        setHabits((prev) =>
          (prev ?? []).map((h) =>
            h.id !== id
              ? h
              : {
                  ...h,
                  checkinDates: done
                    ? [...h.checkinDates.filter((d) => d !== today), today]
                    : h.checkinDates.filter((d) => d !== today),
                },
          ),
        )
      } catch {
        // fail-soft: no romper el panel
      } finally {
        setToggling(null)
      }
    },
    [toggling],
  )

  // Mientras carga, no ocupamos espacio (evita parpadeo en Mission Control).
  if (habits === null) return null
  if (failed) return null

  return (
    <Card className="mb-6 shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Activity size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
            <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Hábitos · hoy</span>
          </div>
          <Link href="/habitos" className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
            {habits.length > 0 ? 'ver todos' : 'crear'}
          </Link>
        </div>

        {habits.length > 0 && (() => {
          const n = habitNudge(habits)
          if (!n) return null
          const cls = n.tone === 'recover' ? 'text-warn' : n.tone === 'win' ? 'text-ok' : 'text-muted-foreground'
          return <p className={cn('text-xs mb-3 -mt-1', cls)}>{n.text}</p>
        })()}

        {habits.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sin hábitos todavía.{' '}
            <Link href="/habitos" className="underline underline-offset-2 hover:text-foreground">
              Creá el primero
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {habits.map((h) => {
              const s = computeHabitStreak(h.checkinDates)
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => toggle(h.id)}
                  disabled={toggling === h.id}
                  aria-label={s.doneToday ? `Desmarcar ${h.title}` : `Marcar ${h.title}`}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-60',
                    s.doneToday ? 'border-ok/40 bg-ok-soft' : 'border-border hover:border-accent/50',
                  )}
                >
                  {toggling === h.id ? (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  ) : s.doneToday ? (
                    <Check size={14} strokeWidth={2.25} className="text-ok" />
                  ) : (
                    <Circle size={14} strokeWidth={1.75} className="text-muted-foreground/50" />
                  )}
                  <span className={cn('font-medium', s.doneToday && 'text-foreground')}>{h.title}</span>
                  {s.current > 0 && (
                    <span className="flex items-center gap-0.5 text-warn tabular-nums">
                      <Flame size={12} strokeWidth={1.75} aria-hidden="true" />
                      {s.current}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
