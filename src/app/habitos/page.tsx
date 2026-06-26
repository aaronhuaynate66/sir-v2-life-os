'use client'
// SIR V2 — /habitos (Etapa 3 — comportamiento)
//
// Hábitos como primitiva: crear (diario o Nx/semana), marcar el check-in (con
// la HORA visible para matar la duda "¿a qué hora marqué?"), ver racha +
// consistencia (diaria o semanal según cadencia), y pedirle a SIR que sugiera
// hábitos pegados a tus objetivos. Fetch directo a /api/habits.

import { useCallback, useEffect, useState } from 'react'
import { Flame, Plus, Check, Circle, Loader2, Activity, Sparkles } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { postJson, toApiError, type ApiError } from '@/lib/api/errors'
import { computeHabitStreak, recentDayMarks, limaDayString } from '@/lib/habits/streak'
import { computeWeeklyStreak } from '@/lib/habits/weekly'
import { limaTimeHHMM } from '@/lib/habits/format'
import type { HabitSuggestion } from '@/lib/habits/suggestParse'

interface HabitDTO {
  id: string
  title: string
  cadence: 'daily' | 'weekly'
  targetPerPeriod: number
  checkinDates: string[]
  checkinTimes: Record<string, string>
}

const TODAY = () => limaDayString(new Date())

export default function HabitosPage() {
  const [habits, setHabits] = useState<HabitDTO[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newCadence, setNewCadence] = useState<'daily' | 'weekly'>('daily')
  const [newTarget, setNewTarget] = useState(3)
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  // Sugerencias de SIR
  const [suggestions, setSuggestions] = useState<HabitSuggestion[] | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestErr, setSuggestErr] = useState<string | null>(null)

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

  useEffect(() => { void load() }, [load])

  const createHabit = useCallback(async (title: string, cadence: 'daily' | 'weekly', target: number) => {
    const t = title.trim()
    if (!t || creating) return
    setCreating(true)
    setError(null)
    try {
      const { habit } = await postJson<{ habit: HabitDTO }>('/api/habits', {
        title: t, cadence, target_per_period: cadence === 'weekly' ? target : 1,
      })
      setHabits((prev) => [...(prev ?? []), habit])
      setNewTitle('')
      setNewCadence('daily')
      setSuggestions((prev) => (prev ? prev.filter((s) => s.title.toLowerCase() !== t.toLowerCase()) : prev))
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setCreating(false)
    }
  }, [creating])

  const askSuggestions = useCallback(async () => {
    if (suggesting) return
    setSuggesting(true); setSuggestErr(null)
    try {
      const res = await fetch('/api/habits/suggest')
      const j = (await res.json()) as { suggestions?: HabitSuggestion[]; note?: string; error?: string }
      if (!res.ok) { setSuggestErr(j.error ?? 'No se pudo generar'); return }
      if (j.note === 'sin_objetivos') { setSuggestErr('Primero fijá tu norte u objetivos para que SIR sugiera hábitos alineados.'); setSuggestions([]); return }
      setSuggestions(j.suggestions ?? [])
    } catch { setSuggestErr('No se pudo generar') } finally { setSuggesting(false) }
  }, [suggesting])

  const toggleDay = useCallback(
    async (id: string, iso?: string) => {
      if (toggling) return
      setToggling(id)
      setError(null)
      const target = iso ?? TODAY()
      try {
        const { done } = await postJson<{ done: boolean }>('/api/habits/checkin', { habit_id: id, date: target })
        setHabits((prev) =>
          (prev ?? []).map((h) => {
            if (h.id !== id) return h
            const dates = done
              ? [...h.checkinDates.filter((d) => d !== target), target]
              : h.checkinDates.filter((d) => d !== target)
            const times = { ...h.checkinTimes }
            if (done) times[target] = new Date().toISOString()
            else delete times[target]
            return { ...h, checkinDates: dates, checkinTimes: times }
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

      {/* Crear hábito */}
      <div className="mb-3 flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void createHabit(newTitle, newCadence, newTarget) }}
          placeholder="Nuevo hábito (ej: meditar, entrenar)"
          className="flex-1"
        />
        <Button onClick={() => void createHabit(newTitle, newCadence, newTarget)} disabled={creating || !newTitle.trim()}>
          {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={1.75} />}
          <span className="ml-1.5 hidden sm:inline">Crear</span>
        </Button>
      </div>

      {/* Cadencia */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted-foreground">Cadencia:</span>
        <button
          type="button"
          onClick={() => setNewCadence('daily')}
          className={'rounded-full border px-3 py-1 ' + (newCadence === 'daily' ? 'border-ok/50 bg-ok-soft text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
        >
          Diario
        </button>
        <button
          type="button"
          onClick={() => setNewCadence('weekly')}
          className={'rounded-full border px-3 py-1 ' + (newCadence === 'weekly' ? 'border-ok/50 bg-ok-soft text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
        >
          Por semana
        </button>
        {newCadence === 'weekly' && (
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => setNewTarget((n) => Math.max(1, n - 1))} className="h-6 w-6 rounded border border-border text-muted-foreground hover:text-foreground">−</button>
            <span className="tabular-nums text-foreground">{newTarget}×/sem</span>
            <button type="button" onClick={() => setNewTarget((n) => Math.min(7, n + 1))} className="h-6 w-6 rounded border border-border text-muted-foreground hover:text-foreground">+</button>
          </span>
        )}
      </div>

      {/* SIR sugiere */}
      <Card className="mb-6 shadow-none">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              <Sparkles size={13} /> SIR te sugiere
            </span>
            <Button size="sm" variant="secondary" disabled={suggesting} onClick={askSuggestions}>
              {suggesting ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Sparkles size={13} className="mr-1" />}
              {suggesting ? 'Pensando…' : suggestions ? 'Otra vez' : '¿Qué me acerca a mi norte?'}
            </Button>
          </div>
          {suggestErr && <p className="mt-2 text-[12.5px] text-warn">{suggestErr}</p>}
          {suggestions && suggestions.length === 0 && !suggestErr && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">SIR no ve un hábito nuevo que sume hoy — lo importante ya está cubierto.</p>
          )}
          {suggestions && suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-foreground">
                      {s.title}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        {s.cadence === 'weekly' ? `${s.targetPerPeriod}×/sem` : 'diario'}
                      </span>
                    </p>
                    {s.rationale && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{s.rationale}</p>}
                  </div>
                  <Button size="sm" disabled={creating} onClick={() => void createHabit(s.title, s.cadence, s.targetPerPeriod)} className="shrink-0">
                    <Plus size={13} className="mr-1" /> Agregar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
            const weekly = h.cadence === 'weekly'
            const daily = computeHabitStreak(h.checkinDates)
            const week = weekly ? computeWeeklyStreak(h.checkinDates, h.targetPerPeriod) : null
            const doneToday = weekly ? (week?.doneToday ?? false) : daily.doneToday
            const streakNum = weekly ? (week?.weeksStreak ?? 0) : daily.current
            const marks = recentDayMarks(h.checkinDates)
            const todayIso = TODAY()
            const todayTime = doneToday ? limaTimeHHMM(h.checkinTimes[todayIso]) : null
            return (
              <Card key={h.id} className="shadow-none">
                <CardContent className="p-4 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => void toggleDay(h.id)}
                    disabled={toggling === h.id}
                    aria-label={doneToday ? 'Desmarcar hoy' : 'Marcar hoy'}
                    className="shrink-0"
                  >
                    {toggling === h.id ? (
                      <Loader2 size={26} className="animate-spin text-muted-foreground" />
                    ) : doneToday ? (
                      <Check size={26} strokeWidth={2.25} className="text-ok" />
                    ) : (
                      <Circle size={26} strokeWidth={1.75} className="text-muted-foreground/50 hover:text-foreground" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {h.title}
                      {weekly && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{h.targetPerPeriod}×/sem</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {weekly
                        ? `esta semana ${week?.thisWeek ?? 0}/${h.targetPerPeriod} · constancia ${week?.consistency ?? 0}% · 8 sem`
                        : `consistencia ${daily.consistency}% · 30 días`}
                    </div>
                    <div className="mt-1.5 flex items-end gap-1.5" aria-label="Últimos 7 días (tocá para marcar)">
                      {marks.map((m) => {
                        const t = limaTimeHHMM(h.checkinTimes[m.iso])
                        return (
                          <button
                            key={m.iso}
                            type="button"
                            onClick={() => void toggleDay(h.id, m.iso)}
                            disabled={toggling === h.id}
                            title={`${m.iso}${m.isToday ? ' · hoy' : ''}${m.done ? ` · hecho${t ? ` ${t}` : ''}` : ' · pendiente'} — tocá para marcar`}
                            aria-label={`${m.iso}${m.done ? ' hecho' : ' pendiente'}`}
                            className="flex flex-col items-center gap-0.5 disabled:opacity-50"
                          >
                            <span
                              className={
                                'h-4 w-4 rounded-full transition-colors ' +
                                (m.done ? 'bg-ok' : 'bg-muted-foreground/20 hover:bg-muted-foreground/40') +
                                (m.isToday ? ' ring-2 ring-offset-1 ring-offset-card ring-ok/60' : '')
                              }
                            />
                            <span className="text-[9px] text-muted-foreground tabular-nums">{m.iso.slice(8, 10)}</span>
                          </button>
                        )
                      })}
                      <span className="ml-1 mb-3 text-[10px] text-muted-foreground">
                        {doneToday ? `hoy ✓${todayTime ? ` ${todayTime}` : ''}` : 'hoy pendiente'}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-center" title={weekly ? 'Semanas en racha' : 'Racha actual'}>
                    <div className="flex items-center gap-1.5 text-sm tabular-nums">
                      <Flame
                        size={16}
                        strokeWidth={1.75}
                        className={streakNum > 0 ? 'text-warn' : 'text-muted-foreground/40'}
                        aria-hidden="true"
                      />
                      <span className={streakNum > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}>{streakNum}</span>
                    </div>
                    {weekly && <span className="text-[9px] text-muted-foreground">sem</span>}
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
