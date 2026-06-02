// SIR V2 — CicloPanel (paridad con SIR V1, sin LLM).
//
// Muestra la fase actual del ciclo menstrual de una persona desde
// cycleStartDate + cycleLengthDays (canonicos people.cycle_start_date /
// cycle_length_days, migration 0010).
//
// Render:
//   - Header: fase + día del ciclo (chip).
//   - Donut visual (SVG) con la fase actual destacada (4 segmentos
//     proporcionales).
//   - Nota contextual estática por fase (sin LLM, observacional).
//   - Footer: próximo período + countdown.
//
// Empty state honesto si cycleStartDate no esta seteado: CTA a editar la
// persona en /relaciones.
//
// Patron visual: Card + shadow-none + uppercase tracking-widest, igual
// que LastInteractionPanel / RelationalScore / BirthdayCountdown.

'use client'

import Link from 'next/link'
import { Activity } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cyclePhase, type CyclePhaseId } from '@/lib/ciclo/phase'
import { useMounted } from '@/hooks/useMounted'
import { cn } from '@/lib/utils'

export interface CicloPanelProps {
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
}

// Colores de fase alineados a la paleta del sistema (bad/warn/ok/brand).
const PHASE_COLOR: Record<CyclePhaseId, string> = {
  menstrual: '#e5564c', // bad
  follicular: '#e0a93b', // warn
  ovulation: '#2dd4a7', // ok
  luteal: '#6e56cf', // brand
}

const PHASE_ACCENT_CLASS: Record<CyclePhaseId, string> = {
  menstrual: 'text-bad',
  follicular: 'text-warn',
  ovulation: 'text-ok',
  luteal: 'text-brand-soft-foreground',
}

export function CicloPanel({ cycleStartDate, cycleLengthDays }: CicloPanelProps) {
  // La fase/día/countdown del ciclo dependen de "hoy" → mount-safe.
  const mounted = useMounted()
  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity
            size={14}
            strokeWidth={1.75}
            className="text-muted-foreground/70"
            aria-hidden="true"
          />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Ciclo menstrual
          </div>
        </div>

        {cycleStartDate ? (
          mounted ? (
            <Body cycleStartDate={cycleStartDate} cycleLengthDays={cycleLengthDays ?? 28} />
          ) : (
            <CicloPlaceholder />
          )
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  )
}

/** Placeholder determinístico mientras se difiere el cómputo del ciclo. */
function CicloPlaceholder() {
  return (
    <div className="flex items-center gap-4 sm:gap-6" aria-hidden="true">
      <div className="w-24 h-24 rounded-full bg-muted/30 animate-pulse shrink-0" />
      <div className="space-y-2">
        <div className="h-5 w-28 rounded bg-muted/40 animate-pulse" />
        <div className="h-3 w-20 rounded bg-muted/30 animate-pulse" />
      </div>
    </div>
  )
}

function Body({
  cycleStartDate,
  cycleLengthDays,
}: {
  cycleStartDate: string
  cycleLengthDays: number
}) {
  const phase = cyclePhase(cycleStartDate, cycleLengthDays)
  if (!phase) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Fecha de inicio inválida o en el futuro. Editala desde{' '}
        <Link href="/relaciones" className="underline underline-offset-2 hover:text-foreground">
          /relaciones
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 sm:gap-6">
        <CicloDonut phase={phase.phase} cycleDay={phase.cycleDay} cycleLength={phase.cycleLength} />
        <div className="space-y-1.5 min-w-0">
          <div className={cn('text-lg font-semibold tracking-tight', PHASE_ACCENT_CLASS[phase.phase])}>
            {phase.label}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            Día {phase.cycleDay} de {phase.cycleLength}
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            ciclo de {phase.cycleLength} días
          </Badge>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border/40 pl-3">
        {phase.contextNote}
      </p>

      <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
        Próximo período:{' '}
        <span className="text-foreground font-medium font-mono">{phase.nextPeriodIso}</span>{' '}
        ·{' '}
        <span className="text-foreground font-medium">
          en {phase.daysUntilNextPeriod === 0 ? 'hoy' : `${phase.daysUntilNextPeriod} día${phase.daysUntilNextPeriod === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground space-y-1.5">
      <p>Sin datos de ciclo.</p>
      <p className="text-xs leading-relaxed">
        Agregá <span className="font-mono text-foreground/80">Inicio del último período</span>{' '}
        desde{' '}
        <Link href="/relaciones" className="underline underline-offset-2 hover:text-foreground">
          /relaciones
        </Link>
        , editando la persona. El largo del ciclo es opcional (default 28 días).
      </p>
    </div>
  )
}

/**
 * Donut SVG simple. 4 segmentos proporcionales al largo de cada fase.
 * El segmento de la fase actual se resalta con stroke completo; el resto
 * queda atenuado. Marcador exterior indica el día actual.
 */
function CicloDonut({
  phase,
  cycleDay,
  cycleLength,
}: {
  phase: CyclePhaseId
  cycleDay: number
  cycleLength: number
}) {
  // Tamaños del SVG.
  const size = 96
  const center = size / 2
  const r = 38
  const strokeWidth = 10

  // Construir los 4 segmentos (menstrual / follicular / ovulation / luteal)
  // segun el mismo modelo de cyclePhase().
  const MENSTRUAL_END = 5
  const OVU_MID = cycleLength - 14
  const OVU_START = OVU_MID - 1
  const OVU_END = OVU_MID + 1

  const segments: Array<{ id: CyclePhaseId; from: number; to: number }> = [
    { id: 'menstrual', from: 0, to: MENSTRUAL_END },
    { id: 'follicular', from: MENSTRUAL_END, to: OVU_START - 1 },
    { id: 'ovulation', from: OVU_START - 1, to: OVU_END },
    { id: 'luteal', from: OVU_END, to: cycleLength },
  ]

  const circumference = 2 * Math.PI * r
  const gap = 2 // px de separacion entre segmentos

  // Marcador del día actual: angulo en radianes.
  const dayAngle = (cycleDay / cycleLength) * 2 * Math.PI - Math.PI / 2
  const markerX = center + (r + strokeWidth / 2 + 3) * Math.cos(dayAngle)
  const markerY = center + (r + strokeWidth / 2 + 3) * Math.sin(dayAngle)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label={`Donut de ciclo: día ${cycleDay} de ${cycleLength}, fase ${phase}`}
    >
      <g transform={`rotate(-90 ${center} ${center})`}>
        {segments.map((seg) => {
          const segLen = Math.max(0, seg.to - seg.from)
          if (segLen <= 0) return null
          const segLenFraction = segLen / cycleLength
          const dashLen = circumference * segLenFraction - gap
          const offset = -(seg.from / cycleLength) * circumference
          const isCurrent = seg.id === phase
          return (
            <circle
              key={seg.id}
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={PHASE_COLOR[seg.id]}
              strokeWidth={strokeWidth}
              strokeOpacity={isCurrent ? 1 : 0.25}
              strokeDasharray={`${Math.max(0, dashLen)} ${circumference}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          )
        })}
      </g>
      {/* Marcador del día actual */}
      <circle cx={markerX} cy={markerY} r={3} fill="currentColor" className="text-foreground" />
      {/* Texto centrado */}
      <text
        x={center}
        y={center - 3}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground"
        fontSize={18}
        fontWeight={600}
      >
        {cycleDay}
      </text>
      <text
        x={center}
        y={center + 13}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-muted-foreground"
        fontSize={9}
        fontFamily="monospace"
      >
        /{cycleLength}
      </text>
    </svg>
  )
}
