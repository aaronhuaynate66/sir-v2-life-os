'use client'

// SIR V2 — /horario: la agenda semanal (cockpit visual).
//
// El cockpit dejó de ser tres listas conmutables (Día/Semana/Mes) y pasó a ser
// un CALENDARIO de verdad — el diseño aprobado en Claude Design, portado a SIR
// (componente HorarioCalendar). Cruza tres fuentes reales en un solo modelo:
//
//   - Calendario (.ics, 60 días)          → eventos 'cal' (azul)
//   - Fechas de la red (cumple/especiales) → 'date' (ámbar), all-day
//   - Tareas OKR que vencen                → 'task' (violeta)
//
// Arriba quedan los paneles accionables (Lo que importa ahora + acciones del
// día); abajo, la gestión de calendarios conectados (colapsable). El board se
// ancla rodante a HOY porque el feed es forward-only (60d, sin pasado).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Clock, ChevronRight } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { LIMA_TZ_LABEL } from '@/lib/calendar/tz'
import type { CalendarEvent, CalendarFeedResult } from '@/lib/calendar/types'
import { buildCockpit } from '@/lib/horario/cockpit'
import { buildBoardEvents } from '@/lib/horario/calendarBoard'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { DailyActionsPanel } from '@/components/horario/DailyActionsPanel'
import { MacroCalendarStrip } from '@/components/horario/MacroCalendarStrip'
import { ActiveSlotBanner } from '@/components/horario/ActiveSlotBanner'
import { WoopPromptCard } from '@/components/horario/WoopPromptCard'
import { CalendarConnections } from '@/components/agenda/CalendarConnections'
import { AgendablesPanel } from '@/components/horario/AgendablesPanel'
import { FocusWindowStrip } from '@/components/horario/FocusWindowStrip'
import dynamic from 'next/dynamic'
// HorarioCalendar es el cockpit visual, ~15KB propios + grid grande. Se
// difiere hasta que el calendar fetch responde (loading:false ya lo cubre
// arriba). Al usarlo con dynamic ssr:false, sale del First Load JS de /horario.
const HorarioCalendar = dynamic(
  () => import('@/components/horario/HorarioCalendar').then((m) => ({ default: m.HorarioCalendar })),
  { ssr: false, loading: () => <CalendarLoadingState /> },
)

type CalendarState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: CalendarFeedResult }

export default function HorarioPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={3} />
  return <HorarioContent />
}

function CalendarLoadingState() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
      Cargando calendario…
    </div>
  )
}

function HorarioContent() {
  const [calReload, setCalReload] = useState(0)
  const [calendar, setCalendar] = useState<CalendarState>({ kind: 'loading' })
  // `now` estable (post-mount) para la fusión determinística del cockpit. El
  // reloj en vivo (countdowns) lo maneja HorarioCalendar internamente.
  const [now, setNow] = useState<Date | null>(null)

  // Data desde los stores (cero red).
  const people = useRelationshipStore((s) => s.people)
  const goals = useGoalStore((s) => s.goals)
  const objectiveSteps = useObjectiveStepStore((s) => s.steps)
  const updateStep = useObjectiveStepStore((s) => s.updateStep)
  // Asignar hora a una tarea OKR desde el calendario: persiste dueTime + targetDate
  // (el día donde estaba). El store sincroniza a Supabase; el cockpit recomputa y
  // la tarea pasa de "Sin hora" a su franja.
  const handleAssignTime = useCallback(
    (stepId: string, hhmm: string, date: string) => updateStep(stepId, { dueTime: hhmm, targetDate: date }),
    [updateStep],
  )

  useEffect(() => {
    setNow(new Date())
  }, [])

  // Flags de status del OAuth de Google (redirect del callback). Los mostramos
  // como toast + limpiamos la URL para no dispararlos en cada navegación.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const ok = params.get('calendar')
    const err = params.get('calendar_error')
    const detail = params.get('calendar_detail')
    if (!ok && !err) return
    if (ok === 'connected') toast.success('Google Calendar conectado', { description: 'Los eventos se van a mezclar con tus otros calendarios.' })
    else if (ok === 'reconnected') toast.success('Google Calendar reautorizado')
    else if (err === 'denied' || err === 'access_denied') toast.error('Autorización denegada', { description: 'Podés reintentar cuando quieras.' })
    else if (err === 'state_mismatch') toast.error('Sesión OAuth inválida', { description: 'Intentalo de nuevo desde el botón "Conectar con Google".' })
    else if (err === 'session_expired') toast.error('Sesión SIR expiró durante el flow', { description: 'Iniciá sesión y reintentá.' })
    else if (err) toast.error(`No se pudo completar la conexión (${err})`, detail ? { description: detail } : undefined)
    if (err) {
      // Deja rastro legible del fallo del callback (el toast pasa volando).
      // eslint-disable-next-line no-console
      console.error('[calendar-oauth] fallo del callback:', err, detail || '')
    }
    // Limpiar SOLO el flag de éxito; el error se deja en la URL para diagnóstico.
    params.delete('calendar')
    if (!err) { params.delete('calendar_error'); params.delete('calendar_detail') }
    const qs = params.toString()
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '')
    window.history.replaceState({}, '', newUrl)
    setCalReload((k) => k + 1)
  }, [])

  // Feed del calendario (una vez al montar / al reconectar).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/calendar?past=7&limit=120', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as CalendarFeedResult
        if (!cancelled) setCalendar({ kind: 'ready', data })
      } catch (e) {
        if (!cancelled) setCalendar({ kind: 'error', message: e instanceof Error ? e.message : 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [calReload])

  const events: CalendarEvent[] = useMemo(
    () => (calendar.kind === 'ready' ? calendar.data.events : []),
    [calendar],
  )

  // Cockpit 'semana': nos da las tareas OKR por día (con su dateKey) y las
  // fechas de la red con aviso anticipado. Los eventos de calendario se pasan
  // crudos (60d) para que el board navegue semanas hacia adelante.
  const cockpit = useMemo(
    () => (now ? buildCockpit({ goals, objectiveSteps, people, events }, 'semana', now) : null),
    [now, goals, objectiveSteps, people, events],
  )
  // Tareas OKR completadas ('hecho') con fecha objetivo en las últimas ~2
  // semanas → "qué se hizo" en los días pasados del board (proxy: ObjectiveStep
  // no guarda fecha de completado, así que se ubican en su targetDate).
  const completedSteps = useMemo(() => {
    if (!now) return []
    const cutoff = new Date(now.getTime() - 14 * 86_400_000)
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
    return objectiveSteps.filter((st) => {
      if (st.kind !== 'task' || st.status !== 'hecho') return false
      // Fecha efectiva: completado real (0070) o, si falta, la fecha objetivo.
      const eff = st.completedAt ? st.completedAt.slice(0, 10) : st.targetDate
      return !!eff && eff >= cutoffStr
    })
  }, [now, objectiveSteps])
  // Hitos de objetivos: goals ACTIVOS con targetDate se pintan como all-day
  // "milestone" el dia del hito para bloquear el dia (mudanza, examenes, etc.).
  const goalMilestones = useMemo(
    () => goals.filter((g) => g.status === 'active' && !!g.targetDate),
    [goals],
  )
  const boardEvents = useMemo(
    () => (now && cockpit ? buildBoardEvents({ events, weekDays: cockpit.weekDays, contactDates: cockpit.contactDates, completedSteps, goalMilestones }, now) : []),
    [now, cockpit, events, completedSteps, goalMilestones],
  )

  const calendarLoading = calendar.kind === 'loading'

  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 sm:mb-8 flex items-start justify-between gap-3 flex-wrap"
      >
        <div>
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2 &mdash; Horario</div>
          <div className="flex items-center gap-3 mt-1">
            <Clock size={28} strokeWidth={1.5} className="text-muted-foreground" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Horario</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Tu agenda semanal: el calendario cruzado con tu vida.</p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mt-2">{LIMA_TZ_LABEL}</span>
      </motion.div>

      {/* 12·M1 — recordatorio activo en la franja (Fogg). Arriba de todo por ser
          time-sensitive; invisible si no hay franja activa ahora. */}
      <ActiveSlotBanner steps={objectiveSteps} onComplete={(id) => updateStep(id, { status: 'hecho', taskStatus: 'done' })} />

      {/* El calendario primero: es lo que el usuario vino a ver. */}
      {now == null || calendarLoading ? (
        <CalendarLoadingState />
      ) : (
        <HorarioCalendar events={boardEvents} onAssignTime={handleAssignTime} />
      )}

      {/* 11·M5 — cronotipo aplicado al día: en qué franja agendar trabajo profundo
          (reusa los motores puros de /salud). Invisible sin data suficiente. */}
      <FocusWindowStrip />

      {/* Acciones del día con la gente, DEBAJO de la agenda (no la empuja).
          "Lo que importa ahora" (ProximoPanel) NO va acá: ya vive en Mission
          Control (/panel); duplicarlo era ruido. */}
      <div className="mt-8">
        <DailyActionsPanel actionableOnly />
      </div>

      {/* Calendario proactivo: fechas próximas de tu gente que SIR puede agendar
          en Google con un clic (solo si hay conexión Google con escritura). */}
      <AgendablesPanel />

      {/* 12·M5 — WOOP vivo: si el "if" de un plan si-entonces se cumple ahora,
          mostrar el "then". Invisible si ningún disparador está activo. */}
      <WoopPromptCard />

      {/* 18·M5 — calendario macro: findes largos + quincena, cruzados con tus
          objetivos. Invisible si no hay nada por venir en el lead. */}
      <MacroCalendarStrip goals={goals} now={now} />

      {/* Gestión de calendarios conectados (setup, no contenido diario) →
          colapsable para no alargar la página. */}
      <details className="mt-8 group">
        <summary className="cursor-pointer list-none flex items-center gap-1.5 py-1 text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans select-none hover:text-foreground transition-colors">
          <ChevronRight size={13} strokeWidth={2} className="transition-transform group-open:rotate-90" aria-hidden="true" />
          Calendarios conectados
        </summary>
        <div className="pt-3">
          <CalendarConnections onChange={() => setCalReload((k) => k + 1)} />
        </div>
      </details>
    </AppShell>
  )
}
