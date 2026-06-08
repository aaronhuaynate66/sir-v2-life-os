'use client'
// SIR V2 — /habitos (Etapa 3 — comportamiento)
//
// Hábitos como primitiva: crear, marcar el check-in de hoy (toggle) y ver
// racha + consistencia (computeHabitStreak, puro). Fetch directo a /api/habits
// (mismo patrón que /buscar), sin store Zustand por ahora.

import { useCallback, useEffect, useState } from 'react'
import { Flame, Plus, Check, Circle, Loader2, Activity } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { postJson, toApiError, type ApiError } from '@/lib/api/errors'
import { computeHabitStreak } from '@/lib/habits/streak'

interface HabitDTO {
  id: string
  title: string
  cadence: 'daily' | 'weekly'
  targetPerPeriod: number
  checkinDates: string[]
}

const TODAY = () => new Date().toISOString().slice(0, 10)

export default function HabitosPage() {
  const [habits, setHabits] = useState<HabitDTO[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/habits')
      if (!res.ok) throw new Error('No se pudieron cargar los hábitos')
      const data = (await res.json()) as { habits: HabitDTO[] }
      setHabits(data.habits)
    } catch (e) {
      setError(toApiError(e))
      setHabits([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createHabit = useCallback(async () => {
    const title = newTitle.trim()
    if (!title || creating) return
    setCreating(true)
    setError(null)
    try {
      const { habit } = await postJson<{ habit: HabitDTO }>('/api/habits', { title })
      setHabits((prev) => [...(prev ?? []), habit])
      setNewTitle('')
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setCreating(false)
    }
  }, [newTitle, creating])

  const toggleToday = useCallback(
    async (id: string) => {
      if (toggling) return
      setToggling(id)
      setError(null)
      try {
        const { done } = await postJson<{ done: boolean }>('/api/habits/checkin', { habit_id: id })
        const today = TODAY()
        setHabits((prev) =>
          (prev ?? []).map((h) => {
            if (h.id !== id) return h
            const dates = done
              ? [...h.checkinDates.filter((d) => d !== today), today]
              : h.checkinDates.filter((d) => d !== today)
            return { ...h, checkinDates: dates }
          }),
        )
      } catch (e) {
        setError(toApiError(e))
      } finally {
        setToggling(null)
      }
    },
    [toggling],
  )

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2</div>
        <div className="flex items-center gap-3">
          <Activity size={28} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Hábitos</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Comportamientos recurrentes. Marcá el día y mirá la racha.
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void createHabit()
          }}
          placeholder="Nuevo hábito (ej: meditar, leer 20 min)"
          className="flex-1"
        />
        <Button onClick={createHabit} disabled={creating || !newTitle.trim()}>
          {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={1.75} />}
          <span className="ml-1.5 hidden sm:inline">Crear</span>
        </Button>
      </div>

      {error && <ApiErrorNotice error={error} className="mb-4" />}

      {habits === null ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </div>
      ) : habits.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          Todavía no tenés hábitos. Creá el primero arriba.
        </div>
      ) : (
        <div className="space-y-3">
          {habits.map((h) => {
            const s = computeHabitStreak(h.checkinDates)
            return (
              <Card key={h.id} className="shadow-none">
                <CardContent className="p-4 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => toggleToday(h.id)}
                    disabled={toggling === h.id}
                    aria-label={s.doneToday ? 'Desmarcar hoy' : 'Marcar hoy'}
                    className="shrink-0"
                  >
                    {toggling === h.id ? (
                      <Loader2 size={26} className="animate-spin text-muted-foreground" />
                    ) : s.doneToday ? (
                      <Check size={26} strokeWidth={2.25} className="text-ok" />
                    ) : (
                      <Circle size={26} strokeWidth={1.75} className="text-muted-foreground/50 hover:text-foreground" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className={s.doneToday ? 'text-sm font-medium' : 'text-sm font-medium text-foreground'}>
                      {h.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      consistencia {s.consistency}% · 30 días
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5 text-sm tabular-nums" title="Racha actual">
                    <Flame
                      size={16}
                      strokeWidth={1.75}
                      className={s.current > 0 ? 'text-warn' : 'text-muted-foreground/40'}
                      aria-hidden="true"
                    />
                    <span className={s.current > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      {s.current}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
