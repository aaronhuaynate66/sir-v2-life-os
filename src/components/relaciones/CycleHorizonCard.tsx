'use client'

// SIR V2 — Horizonte del ciclo (rediseño ficha · módulo protagonista).
//
// Cruza el ciclo (real atrás + proyectado adelante con incertidumbre) con los
// EVENTOS de pareja/calendario, y por cada uno da su día+fase + una lectura de
// CUIDADO (qué timing/gesto conviene). Reusa el engine puro buildCycleHorizon.
//
// LÍNEA ÉTICA (doc 17): timing y presencia, NUNCA presión ni descalificación.

import { useMemo } from 'react'
import { CalendarHeart, Cake, Sparkles, MapPin, Circle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { computeCycleRegularity } from '@/lib/ciclo/regularity'
import { buildCycleHorizon, gatherHorizonEvents, type HorizonEvent, type HorizonEventKind } from '@/lib/ciclo/horizon'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'
import type { SpecialDate } from '@/types'
import type { CyclePhaseId } from '@/lib/ciclo/phase'
import { cn } from '@/lib/utils'

const HORIZON_BACK_DAYS = 21
const HORIZON_FWD_DAYS = 75

const PHASE_META: Record<CyclePhaseId, { label: string; dot: string; chip: string }> = {
  menstrual: { label: 'menstrual', dot: 'bg-bad', chip: 'border-bad/30 text-bad' },
  follicular: { label: 'folicular', dot: 'bg-ok', chip: 'border-ok/30 text-ok' },
  ovulation: { label: 'ovulación', dot: 'bg-brand', chip: 'border-brand/40 text-brand-soft-foreground' },
  luteal: { label: 'lútea', dot: 'bg-warn/70', chip: 'border-warn/30 text-warn' },
}

const KIND_ICON: Record<HorizonEventKind, typeof CalendarHeart> = {
  mesario: CalendarHeart,
  anniversary: CalendarHeart,
  birthday: Cake,
  trip: MapPin,
  calendar: Circle,
  partner: Sparkles,
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface CycleHorizonCardProps {
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
  personCycles?: PersonCycleEntry[]
  specialDates?: SpecialDate[]
  birthDate?: string | null
  personName: string
}

export function CycleHorizonCard({
  cycleStartDate,
  cycleLengthDays,
  personCycles = [],
  specialDates = [],
  birthDate,
  personName,
}: CycleHorizonCardProps) {
  const model = useMemo(() => {
    if (!cycleStartDate) return null
    const now = new Date()
    const from = new Date(now.getTime() - HORIZON_BACK_DAYS * 86_400_000)
    const to = new Date(now.getTime() + HORIZON_FWD_DAYS * 86_400_000)
    const fromIso = iso(from), toIso = iso(to)

    const events = gatherHorizonEvents({ specialDates, birthDate, personName, fromIso, toIso, now })

    const reg = computeCycleRegularity(personCycles.map((e) => ({ date: e.date, phase: e.phase })))
    const horizon = buildCycleHorizon(
      { lastPeriodStart: cycleStartDate.slice(0, 10), cycleLengthDays: cycleLengthDays ?? 28, bandDays: reg.bandDays, events, horizonFrom: fromIso, horizonTo: toIso },
      now,
    )
    return { horizon, reg, fromIso, toIso, todayIso: iso(now) }
  }, [cycleStartDate, cycleLengthDays, personCycles, specialDates, birthDate, personName])

  if (!model?.horizon) return null
  const { horizon, reg } = model
  const upcoming = horizon.events.filter((e) => e.isFuture).slice(0, 6)
  if (upcoming.length === 0) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarHeart size={14} strokeWidth={1.75} className="text-brand-soft-foreground" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Horizonte del ciclo</h2>
          {reg.regularity !== 'insufficient' && reg.bandDays > 0 && (
            <span className="text-[10px] text-muted-foreground">predicción ±{reg.bandDays}d · se recalibra con cada período</span>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
          Próximos eventos cruzados con la fase estimada del ciclo — para elegir el mejor momento y cuidado, no para presionar.
        </p>

        <ul className="space-y-2">
          {upcoming.map((ev) => (
            <HorizonRow key={`${ev.date}_${ev.label}`} ev={ev} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function HorizonRow({ ev }: { ev: HorizonEvent }) {
  const Icon = KIND_ICON[ev.kind]
  const phase = PHASE_META[ev.phase]
  const when = new Date(`${ev.date}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
  return (
    <li className="rounded-md border border-border bg-secondary/40 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Icon size={13} strokeWidth={1.75} className="text-text-tertiary shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">{ev.label}</span>
        <span className="text-[11px] text-muted-foreground">· {when}</span>
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ml-auto', phase.chip)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', phase.dot)} aria-hidden="true" />
          día {ev.cycleDay} · {ev.isPms ? 'SPM' : phase.label}
          {ev.uncertainDays > 0 && <span className="text-muted-foreground/70">±{ev.uncertainDays}d</span>}
        </span>
      </div>
      <p className="text-[12px] text-foreground/85 mt-1.5 leading-relaxed">{ev.reading}</p>
    </li>
  )
}
