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
import { computeCycleRegularity, type PredictionConfidence } from '@/lib/ciclo/regularity'
import type { PersonCycleEntry, CyclePhase } from '@/lib/person-cycles/types'
import { cycleEntriesWithNotes } from '@/lib/person-cycles/notes'
import { useMounted } from '@/hooks/useMounted'
import { cn } from '@/lib/utils'

// Etiquetas legibles de las fases registradas día a día (person_cycles).
const ENTRY_PHASE_LABEL: Record<CyclePhase, string> = {
  bleeding: 'Menstruación',
  pms: 'Premenstrual',
  mid_cycle: 'Mitad de ciclo',
  ovulation: 'Ovulación',
  luteal: 'Lútea',
  unknown: 'Sin fase',
}

export interface CicloPanelProps {
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
  /** 17·M4 — registros de person_cycles para medir la regularidad → confianza. */
  personCycles?: PersonCycleEntry[]
}

const CONFIDENCE_LABEL: Record<PredictionConfidence, { text: string; cls: string }> = {
  high: { text: 'predicción confiable', cls: 'text-ok' },
  medium: { text: 'predicción orientativa', cls: 'text-warn' },
  low: { text: 'ciclo irregular — estimación amplia', cls: 'text-bad' },
  insufficient: { text: 'pocos ciclos aún — estimación amplia', cls: 'text-muted-foreground' },
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

export function CicloPanel({ cycleStartDate, cycleLengthDays, personCycles = [] }: CicloPanelProps) {
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
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            Ciclo menstrual
          </div>
        </div>

        {cycleStartDate ? (
          mounted ? (
            <Body cycleStartDate={cycleStartDate} cycleLengthDays={cycleLengthDays ?? 28} personCycles={personCycles} />
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
  personCycles,
}: {
  cycleStartDate: string
  cycleLengthDays: number
  personCycles: PersonCycleEntry[]
}) {
  const phase = cyclePhase(cycleStartDate, cycleLengthDays)
  // 17·M4 — regularidad observada → confianza de la predicción.
  const reg = computeCycleRegularity(personCycles.map((e) => ({ date: e.date, phase: e.phase })))
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

      {/* 17·M1 — ventana PMS / fértil. Encuadre de CUIDADO, nunca de juicio. */}
      {phase.isPmsWindow && (
        <div className="rounded-md border border-warn/30 bg-warn-soft/40 px-3 py-2 text-[11px] text-foreground/90 leading-relaxed">
          <span className="font-medium text-warn">Ventana premenstrual.</span>{' '}
          Puede venir más sensibilidad o menos energía — un gesto de presencia suma.
          No es una explicación de lo que siente, es un recordatorio para cuidar.
        </div>
      )}
      {phase.isFertileWindow && !phase.isPmsWindow && (
        <div className="text-[11px] text-muted-foreground border-l-2 border-border/40 pl-3">
          Ventana fértil aproximada (orientativa — no es método anticonceptivo).
        </div>
      )}

      <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
        Próximo período:{' '}
        <span className="text-foreground font-medium font-mono">{phase.nextPeriodIso}</span>{' '}
        ·{' '}
        <span className="text-foreground font-medium">
          en {phase.daysUntilNextPeriod === 0 ? 'hoy' : `${phase.daysUntilNextPeriod} día${phase.daysUntilNextPeriod === 1 ? '' : 's'}`}
        </span>
        {reg.regularity !== 'insufficient' && reg.bandDays > 0 && (
          <span className="text-muted-foreground/70"> (±{reg.bandDays}d)</span>
        )}
        {/* 17·M4 — confianza de la predicción según la regularidad observada. */}
        <span className={cn('block mt-1', CONFIDENCE_LABEL[reg.confidence].cls)}>
          {CONFIDENCE_LABEL[reg.confidence].text}
          {reg.observedCycles >= 2 && ` · ${reg.observedCycles} ciclos observados`}
        </span>
      </div>

      {/* Rescate DD — notas del ciclo (person_cycles.note): lo que registraste
          día a día ya no se pierde. Encuadre de cuidado, sin interpretación. */}
      <CycleNotes entries={personCycles} />
    </div>
  )
}

/** Lista los registros de ciclo que tienen nota, más recientes primero. Data
 *  sensible y privada: se muestra tal cual la cargaste, sin juicio. */
function CycleNotes({ entries }: { entries: PersonCycleEntry[] }) {
  const withNote = cycleEntriesWithNotes(entries)
  if (withNote.length === 0) return null
  const shown = withNote.slice(0, 4)

  return (
    <div className="border-t border-border/40 pt-3 space-y-2">
      <div className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary">Notas del ciclo</div>
      <ul className="space-y-2">
        {shown.map((e) => (
          <li key={e.id} className="text-[12px] leading-relaxed">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 font-mono">
              <span>{e.date}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{ENTRY_PHASE_LABEL[e.phase]}</span>
              {e.source === 'self_report' && (
                <span className="not-italic rounded bg-ok-soft/50 px-1 py-px text-ok text-[9px] tracking-normal">ella lo registró</span>
              )}
              {e.confidence === 'low' && <span className="text-muted-foreground/50">· dato incierto</span>}
            </div>
            <p className="text-foreground/85 mt-0.5">{e.note}</p>
          </li>
        ))}
      </ul>
      {withNote.length > shown.length && (
        <div className="text-[10px] text-muted-foreground/60">+{withNote.length - shown.length} nota{withNote.length - shown.length === 1 ? '' : 's'} más</div>
      )}
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
