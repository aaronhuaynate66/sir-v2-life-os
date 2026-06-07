'use client'

// SIR V2 — /horario: el cockpit operativo del OS (Fase 1).
//
// Dejó de ser un espejo pasivo del calendario: cruza el calendario con la data
// REAL de SIR (OKRs, fechas de la red, estado físico) en tres horizontes
// conmutables — DÍA / SEMANA / MES.
//
//   - Día   : estado físico + AHORA/PRÓXIMO + timeline del calendario, con las
//             tareas OKR que vencen hoy fusionadas.
//   - Semana: foco (1–3 KRs) + los 7 días (eventos + tareas) + fechas de la red
//             con aviso anticipado.
//   - Mes   : hitos y deadlines (targets, deadlines, fechas) — carga del mes.
//
// La fusión es determinística y pura (lib/horario/cockpit + physical). El
// calendario se trae una vez por API; el resto sale de los stores (cero red).
// El countdown del Día corre client-side (tick 1s) sin tocar red.
//
// FASE 2 (futura, NO implementada): briefs de preparación por bloque y un
// "plan del día" generado con grounding. La estructura (buckets con eventos +
// tareas + estado) ya está lista para alimentarlos sin reescribir esta vista.

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton, SkeletonBlocks } from '@/components/skeletons/RouteSkeleton'
import { buildDayTimeline } from '@/lib/calendar/timeline'
import { LIMA_TZ_LABEL } from '@/lib/calendar/tz'
import type { CalendarEvent, CalendarFeedResult } from '@/lib/calendar/types'
import { buildCockpit, type Horizon } from '@/lib/horario/cockpit'
import { buildPhysicalState } from '@/lib/horario/physical'
import { buildYearCompass } from '@/lib/year-compass/build'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { HorizonToggle } from '@/components/horario/HorizonToggle'
import { DiaView } from '@/components/horario/DiaView'
import { SemanaView } from '@/components/horario/SemanaView'
import { MesView } from '@/components/horario/MesView'

type CalendarState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: CalendarFeedResult }

export default function HorarioPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={3} />
  return <HorarioContent />
}

function HorarioContent() {
  const [horizon, setHorizon] = useState<Horizon>('dia')
  const [calendar, setCalendar] = useState<CalendarState>({ kind: 'loading' })
  // `now` estable (post-mount) para la fusión determinística; `nowMs` tickea
  // sólo en Día para el countdown en vivo.
  const [now, setNow] = useState<Date | null>(null)
  const [nowMs, setNowMs] = useState<number>(0)

  // Data desde los stores (cero red).
  const people = useRelationshipStore((s) => s.people)
  const goals = useGoalStore((s) => s.goals)
  const objectiveSteps = useObjectiveStepStore((s) => s.steps)
  const healthMetrics = useSelfStore((s) => s.healthMetrics)
  const sleepRecords = useSelfStore((s) => s.sleepRecords)
  const selfMetrics = useSelfStore((s) => s.selfMetrics)

  // Mount-safe: el orden/horizonte depende de "hoy".
  useEffect(() => {
    const d = new Date()
    setNow(d)
    setNowMs(d.getTime())
  }, [])

  // Tick 1s sólo en Día (los countdowns viven ahí).
  useEffect(() => {
    if (horizon !== 'dia') return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [horizon])

  // Feed del calendario (una vez al montar).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/calendar', { cache: 'no-store' })
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
  }, [])

  // Estable mientras el feed no cambie (evita recomputar el cockpit por render).
  const events: CalendarEvent[] = useMemo(
    () => (calendar.kind === 'ready' ? calendar.data.events : []),
    [calendar],
  )
  const configured = calendar.kind === 'ready' ? calendar.data.configured : false
  const calendarError = calendar.kind === 'error' || (calendar.kind === 'ready' && !!calendar.data.error)
  const calendars = calendar.kind === 'ready' ? (calendar.data.calendars ?? []) : []

  const cockpit = useMemo(
    () => (now ? buildCockpit({ goals, objectiveSteps, people, events }, horizon, now) : null),
    [now, goals, objectiveSteps, people, events, horizon],
  )
  const physical = useMemo(
    () => buildPhysicalState({ healthMetrics, sleepRecords, selfMetrics }),
    [healthMetrics, sleepRecords, selfMetrics],
  )
  // Ancla del año (Tu Año) — sólo para el contexto del Brief del mes.
  const yearAnchor = useMemo(() => (now ? buildYearCompass(goals, now).anchor : null), [now, goals])

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
          <p className="text-sm text-muted-foreground mt-1">Tu cockpit operativo: calendario cruzado con tu vida.</p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mt-2">{LIMA_TZ_LABEL}</span>
      </motion.div>

      <div className="mb-5">
        <HorizonToggle value={horizon} onChange={setHorizon} />
      </div>

      {cockpit == null ? (
        <SkeletonBlocks cards={3} header={false} />
      ) : horizon === 'dia' ? (
        calendarLoading ? (
          <SkeletonBlocks cards={3} header={false} />
        ) : (
          <DiaView
            timeline={buildDayTimeline(events, nowMs)}
            tasksToday={cockpit.tasksToday}
            contactDates={cockpit.contactDates}
            physical={physical}
            nowMs={nowMs}
            configured={configured}
            calendarError={calendarError}
            calendars={calendars}
          />
        )
      ) : horizon === 'semana' ? (
        <SemanaView
          focus={cockpit.focus}
          weekDays={cockpit.weekDays}
          contactDates={cockpit.contactDates}
          configured={configured}
          nowMs={nowMs}
        />
      ) : (
        <MesView milestones={cockpit.milestones} anchor={yearAnchor} nowMs={nowMs} />
      )}
    </AppShell>
  )
}
