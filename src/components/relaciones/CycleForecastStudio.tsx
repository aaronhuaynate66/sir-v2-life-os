'use client'
// SIR V2 — Estudio del ciclo: horizonte movible + briefing multi-evento + "¿qué
// pasaría si…?". Es el DUEÑO de la fecha seleccionada (una sola fuente de verdad)
// que comparten la banda del horizonte (cursor arrastrable) y el briefing de
// cuidado. Reemplaza el montaje suelto de EventCareBriefCard + CycleHorizonCard y
// colapsa su fetch duplicado (usePersonalEvents una sola vez).
//
// LÍNEA ÉTICA (doc 17): cuidado, no gestión; tendencia, no diagnóstico.

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { CycleHorizonCard } from './CycleHorizonCard'
import { EventCareBriefCard } from './EventCareBriefCard'
import { TravelPlannerCard } from './TravelPlannerCard'
import { BehaviorHorizonCard } from './BehaviorHorizonCard'
import { PatronesCiclo } from './PatronesCiclo'
import { CyclePhaseForecastCard } from './CyclePhaseForecastCard'
import { scrubReducer, initialScrub } from '@/lib/ciclo/cycleScrub'
import { usePersonalEvents } from '@/lib/personal-events/usePersonalEvents'
import { cyclePhase } from '@/lib/ciclo/phase'
import { computeCycleRegularity } from '@/lib/ciclo/regularity'
import { cn } from '@/lib/utils'
import type { CareBond } from '@/lib/ciclo/eventCareBrief'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { PersonLog } from '@/lib/person-logs/types'
import type { SpecialDate } from '@/types'

/** Sub-vistas del módulo de ciclo (7a). */
type CycleView = 'horizonte' | 'elegir' | 'mejor' | 'repite'

export interface CycleForecastStudioProps {
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
  personCycles?: PersonCycleEntry[]
  specialDates?: SpecialDate[]
  birthDate?: string | null
  /** Episodios con la persona → patrones por fase (tab "Lo que se repite"). */
  moments?: RelationshipMoment[]
  /** Últimos logs (tono por fase en PatronesCiclo). */
  personLogs?: PersonLog[]
  /** Set amplio ~2 años (proyección forward por fase). */
  correlationLogs?: PersonLog[]
  personId: string
  personName: string
  /** Registro del briefing según el vínculo (pareja/familia/colega/amiga). */
  bond: CareBond
  /** Bump desde PersonDetail cuando se agrega/borra un plan (refetch). */
  refreshKey?: number
  /** Avisar a PersonDetail que cambió un plan (para refrescar todo lo demás). */
  onPlanChange?: () => void
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CycleForecastStudio(props: CycleForecastStudioProps) {
  const { cycleStartDate, cycleLengthDays, personCycles = [], specialDates = [], birthDate, moments = [], personLogs = [], correlationLogs = [], personId, personName, bond, refreshKey = 0, onPlanChange } = props
  const isPartner = bond === 'partner'

  // "Ahora" estable (una sola vez) → sin mismatch de hidratación al compartirlo.
  const [now] = useState(() => new Date())
  const todayIso = isoOf(now)

  const { events } = usePersonalEvents(cycleStartDate ? personId : null, refreshKey)
  const [scrub, dispatch] = useReducer(scrubReducer, initialScrub)
  const [view, setView] = useState<CycleView>('horizonte')

  // Al cargar, abrir en el próximo plan (comportamiento previo), pero navegable.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || events.length === 0) return
    const up = events
      .filter((e) => e.personId === personId && e.date >= todayIso)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    if (up.length > 0) { dispatch({ t: 'event', iso: up[0].date, id: up[0].id }); didInit.current = true }
  }, [events, personId, todayIso])

  const firstName = personName.split(' ')[0] || personName

  // Cabecera del módulo: "Día N · fase · período ~fecha (±Nd · M ciclos)".
  const header = useMemo(() => {
    if (!cycleStartDate) return null
    const cp = cyclePhase(cycleStartDate.slice(0, 10), cycleLengthDays ?? 28, now)
    if (!cp) return null
    const reg = computeCycleRegularity(personCycles.map((e) => ({ date: e.date, phase: e.phase })))
    let periodLabel = ''
    try {
      const d = new Date(`${cp.nextPeriodIso}T12:00:00`)
      periodLabel = d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
    } catch { /* noop */ }
    return { cycleDay: cp.cycleDay, phaseLabel: cp.label, periodLabel, bandDays: reg.bandDays, nCycles: personCycles.length }
  }, [cycleStartDate, cycleLengthDays, personCycles, now])

  // Sin fecha confirmada: solo el 2º horizonte (conductual), que funciona sin ancla.
  if (!cycleStartDate) {
    return (
      <BehaviorHorizonCard
        personId={personId}
        personName={personName}
        cycleStartDate={cycleStartDate}
        cycleLengthDays={cycleLengthDays}
        now={now}
      />
    )
  }

  const TABS: { key: CycleView; label: string }[] = [
    { key: 'horizonte', label: 'Horizonte' },
    { key: 'elegir', label: 'Elegir un día' },
    ...(isPartner ? [{ key: 'mejor' as CycleView, label: 'Mejor fecha' }] : []),
    { key: 'repite', label: 'Lo que se repite' },
  ]

  return (
    <div className="mb-4 rounded-[13px] border border-border bg-card overflow-hidden">
      {/* ── Cabecera compartida del módulo ─────────────────────────── */}
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5 sm:px-5">
        {header && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand/40 font-mono text-sm font-semibold text-brand">
            {header.cycleDay}
          </span>
        )}
        <div className="min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">El ciclo de {firstName}</div>
          {header && (
            <div className="text-sm text-foreground truncate">
              Día {header.cycleDay} · {header.phaseLabel}
              {header.periodLabel && <span className="text-muted-foreground"> · período ~{header.periodLabel}</span>}
              {header.bandDays > 0 && <span className="text-[11px] text-muted-foreground"> (±{header.bandDays}d{header.nCycles > 0 ? ` · ${header.nCycles} ciclos` : ''})</span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Barra de sub-vistas ────────────────────────────────────── */}
      <div role="tablist" aria-label="Sub-vistas del ciclo" className="flex gap-1 border-b border-border px-3 sm:px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={view === t.key}
            onClick={() => setView(t.key)}
            className={cn(
              'relative -mb-px px-2.5 py-2 text-[13px] transition-colors min-h-[36px]',
              view === t.key
                ? 'text-foreground font-medium border-b-2 border-brand'
                : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Sub-vista activa (una sola card a la vez, sin apilar 6). Aplano la
          card interna (borde/fondo/sombra) para que se vea como parte del
          módulo, no como una card dentro de otra. ─────────────────── */}
      <div className={cn(
        '[&>*]:rounded-none [&>*]:border-0 [&>*]:bg-transparent [&>*]:shadow-none',
        // "Lo que se repite" apila 3 lecturas de patrón → deja el mb-4 propio de
        // cada card para separarlas (headers claros, sin líneas divisorias); el
        // resto de sub-vistas es 1 sola card, sin margen sobrante.
        view === 'repite' ? '[&>*]:mb-4 [&>*:last-child]:mb-0' : '[&>*]:mb-0',
      )}>
        {view === 'horizonte' && (
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
        )}
        {view === 'elegir' && (
          <EventCareBriefCard
            cycleStartDate={cycleStartDate}
            cycleLengthDays={cycleLengthDays}
            personCycles={personCycles}
            personId={personId}
            personName={personName}
            personalEvents={events}
            now={now}
            bond={bond}
            allowDeepRead={isPartner}
            selectedDate={scrub.selectedDate}
            mode={scrub.mode}
            selectedEventId={scrub.selectedEventId}
            onSelectDate={(iso, mode, eventId) => dispatch(mode === 'event' ? { t: 'event', iso, id: eventId ?? '' } : { t: 'date', iso })}
            onToday={() => dispatch({ t: 'today' })}
            onPlanSaved={() => { onPlanChange?.() }}
          />
        )}
        {view === 'mejor' && isPartner && (
          <TravelPlannerCard
            cycleStartDate={cycleStartDate}
            cycleLengthDays={cycleLengthDays}
            personCycles={personCycles}
            personName={personName}
            now={now}
            onSelectDate={(iso) => { dispatch({ t: 'date', iso }); setView('elegir') }}
          />
        )}
        {view === 'repite' && (
          <>
            {/* Descriptivo: cómo se distribuyen los episodios y el tono por fase. */}
            <PatronesCiclo
              personName={personName}
              moments={moments}
              personCycles={personCycles}
              personLogs={personLogs}
              cycleStartDate={cycleStartDate}
              cycleLengthDays={cycleLengthDays}
            />
            {/* Proyección forward del tono/energía por fase (cuidado, no diagnóstico). */}
            <CyclePhaseForecastCard
              personLogs={correlationLogs}
              cycleStartDate={cycleStartDate}
              cycleLengthDays={cycleLengthDays}
              personName={personName}
            />
            {/* 2º horizonte conductual (probabilístico). */}
            <BehaviorHorizonCard
              personId={personId}
              personName={personName}
              cycleStartDate={cycleStartDate}
              cycleLengthDays={cycleLengthDays}
              now={now}
            />
          </>
        )}
      </div>

      {/* Disclaimer ético UNA vez para todo el módulo (antes se repetía en cada
          sub-card ~6×). Doc 17: cuidado, no gestión; tendencia, no diagnóstico. */}
      <p className="mt-3 pt-3 border-t border-border/40 text-[11px] leading-relaxed text-muted-foreground">
        Coincidencia, no causa. Es contexto para acompañar con más cuidado — nunca un diagnóstico ni una explicación de lo que {personName.split(' ')[0]} siente.
      </p>
    </div>
  )
}
