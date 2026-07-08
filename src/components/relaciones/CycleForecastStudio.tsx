'use client'
// SIR V2 — Estudio del ciclo: horizonte movible + briefing multi-evento + "¿qué
// pasaría si…?". Es el DUEÑO de la fecha seleccionada (una sola fuente de verdad)
// que comparten la banda del horizonte (cursor arrastrable) y el briefing de
// cuidado. Reemplaza el montaje suelto de EventCareBriefCard + CycleHorizonCard y
// colapsa su fetch duplicado (usePersonalEvents una sola vez).
//
// LÍNEA ÉTICA (doc 17): cuidado, no gestión; tendencia, no diagnóstico.

import { useEffect, useReducer, useRef, useState } from 'react'

import { CycleHorizonCard } from './CycleHorizonCard'
import { EventCareBriefCard } from './EventCareBriefCard'
import { scrubReducer, initialScrub } from '@/lib/ciclo/cycleScrub'
import { usePersonalEvents } from '@/lib/personal-events/usePersonalEvents'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'
import type { SpecialDate } from '@/types'

export interface CycleForecastStudioProps {
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
  personCycles?: PersonCycleEntry[]
  specialDates?: SpecialDate[]
  birthDate?: string | null
  personId: string
  personName: string
  /** Bump desde PersonDetail cuando se agrega/borra un plan (refetch). */
  refreshKey?: number
  /** Avisar a PersonDetail que cambió un plan (para refrescar todo lo demás). */
  onPlanChange?: () => void
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CycleForecastStudio(props: CycleForecastStudioProps) {
  const { cycleStartDate, cycleLengthDays, personCycles = [], specialDates = [], birthDate, personId, personName, refreshKey = 0, onPlanChange } = props

  // "Ahora" estable (una sola vez) → sin mismatch de hidratación al compartirlo.
  const [now] = useState(() => new Date())
  const todayIso = isoOf(now)

  const { events } = usePersonalEvents(cycleStartDate ? personId : null, refreshKey)
  const [scrub, dispatch] = useReducer(scrubReducer, initialScrub)

  // Al cargar, abrir en el próximo plan (comportamiento previo), pero navegable.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || events.length === 0) return
    const up = events
      .filter((e) => e.personId === personId && e.date >= todayIso)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    if (up.length > 0) { dispatch({ t: 'event', iso: up[0].date, id: up[0].id }); didInit.current = true }
  }, [events, personId, todayIso])

  if (!cycleStartDate) return null

  return (
    <div>
      <CycleHorizonCard
        cycleStartDate={cycleStartDate}
        cycleLengthDays={cycleLengthDays}
        personCycles={personCycles}
        specialDates={specialDates}
        birthDate={birthDate}
        personName={personName}
        personId={personId}
        events={events}
        now={now}
        selectedDate={scrub.selectedDate}
        onSelectDate={(iso) => dispatch({ t: 'date', iso })}
      />
      <EventCareBriefCard
        cycleStartDate={cycleStartDate}
        cycleLengthDays={cycleLengthDays}
        personCycles={personCycles}
        personId={personId}
        personName={personName}
        personalEvents={events}
        now={now}
        selectedDate={scrub.selectedDate}
        mode={scrub.mode}
        selectedEventId={scrub.selectedEventId}
        onSelectDate={(iso, mode, eventId) => dispatch(mode === 'event' ? { t: 'event', iso, id: eventId ?? '' } : { t: 'date', iso })}
        onToday={() => dispatch({ t: 'today' })}
        onPlanSaved={() => { onPlanChange?.() }}
      />
    </div>
  )
}
