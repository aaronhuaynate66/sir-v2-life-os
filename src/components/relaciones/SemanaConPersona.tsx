'use client'
// SIR V2 — SemanaConPersona: timeline horizontal de 7 días con esta persona.
//
// Muestra los últimos 6 días + hoy en una tira, con lo que pasó en cada uno:
//   - Fase del ciclo (registro) → tono de fondo del día
//   - Tono de interacción (person_log kind='interaction') → chip 1..5
//   - Moments que ocurrieron ese día → punto rojo/naranja/verde según status
//   - Días sin nada → gris (no infiere)
//
// Se oculta si no hay NADA en los 7 días (evita ruido en fichas frías).

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar, MessageCircle, AlertCircle, CheckCircle2, Circle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { PersonLog } from '@/lib/person-logs/types'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { PersonCycleEntry, CyclePhase } from '@/lib/person-cycles/types'

interface Props {
  personName: string
  personLogs: PersonLog[]
  moments: RelationshipMoment[]
  personCycles: PersonCycleEntry[]
}

const DAY_MS = 86_400_000

interface DayCell {
  ymd: string
  dayLabel: string  // "mié"
  dayNum: string    // "02"
  isToday: boolean
  cyclePhase: CyclePhase | null
  interactionValue: number | null
  interactionCount: number
  openMoments: number
  resolvedMoments: number
}

const DAY_ABBR = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PHASE_BG: Record<CyclePhase, string> = {
  bleeding: 'bg-bad/10',
  pms: 'bg-warn/10',
  mid_cycle: 'bg-ok/10',
  ovulation: 'bg-ok/15',
  luteal: 'bg-brand/10',
  unknown: 'bg-muted/20',
}

const PHASE_ABBR: Record<CyclePhase, string> = {
  bleeding: 'regla',
  pms: 'pms',
  mid_cycle: 'mid',
  ovulation: 'ovu',
  luteal: 'lut',
  unknown: '?',
}

export function SemanaConPersona({ personName, personLogs, moments, personCycles }: Props) {
  const cells = useMemo<DayCell[]>(() => {
    const now = new Date()
    const days: DayCell[] = []
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(now.getTime() - offset * DAY_MS)
      const ymd = ymdOf(d)
      days.push({
        ymd,
        dayLabel: DAY_ABBR[d.getDay()],
        dayNum: String(d.getDate()).padStart(2, '0'),
        isToday: offset === 0,
        cyclePhase: null,
        interactionValue: null,
        interactionCount: 0,
        openMoments: 0,
        resolvedMoments: 0,
      })
    }
    const byYmd = new Map(days.map((c) => [c.ymd, c]))

    for (const c of personCycles) {
      const cell = byYmd.get(c.date); if (cell) cell.cyclePhase = c.phase
    }
    // Interacción: promedio del día si hay múltiples.
    const interSums = new Map<string, { sum: number; count: number }>()
    for (const l of personLogs) {
      if (l.kind !== 'interaction') continue
      const ymd = l.loggedAt.slice(0, 10)
      if (!byYmd.has(ymd)) continue
      const acc = interSums.get(ymd) ?? { sum: 0, count: 0 }
      acc.sum += l.value; acc.count += 1
      interSums.set(ymd, acc)
    }
    for (const [ymd, acc] of interSums) {
      const cell = byYmd.get(ymd)!
      cell.interactionValue = Math.round((acc.sum / acc.count) * 10) / 10
      cell.interactionCount = acc.count
    }
    for (const m of moments) {
      const ymd = m.occurredOn.slice(0, 10)
      const cell = byYmd.get(ymd); if (!cell) continue
      if (m.status === 'abierto') cell.openMoments++
      else cell.resolvedMoments++
    }
    return days
  }, [personLogs, moments, personCycles])

  const hasAnything = cells.some((c) =>
    c.cyclePhase != null || c.interactionValue != null || c.openMoments > 0 || c.resolvedMoments > 0,
  )
  if (!hasAnything) return null

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4">
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
              7 días con {personName.split(' ')[0]}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((c) => (
              <div
                key={c.ymd}
                className={cn(
                  'rounded-md border p-1.5 flex flex-col items-center gap-1 text-center',
                  c.cyclePhase ? PHASE_BG[c.cyclePhase] : 'bg-muted/10',
                  c.isToday ? 'border-brand/60 ring-1 ring-brand/40' : 'border-border/60',
                )}
                title={c.ymd}
              >
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.dayLabel}</div>
                <div className={cn('text-sm font-mono font-semibold', c.isToday && 'text-brand')}>{c.dayNum}</div>
                {c.cyclePhase && (
                  <div className="text-[9px] font-medium text-muted-foreground">{PHASE_ABBR[c.cyclePhase]}</div>
                )}
                <div className="flex flex-col gap-0.5 items-center min-h-[24px]">
                  {c.interactionValue != null && (
                    <div className="inline-flex items-center gap-0.5 text-[9px] text-foreground/80" title={`${c.interactionCount} interacción(es)`}>
                      <MessageCircle size={8} strokeWidth={1.75} />
                      <span className="font-mono font-medium">{c.interactionValue}</span>
                    </div>
                  )}
                  {c.openMoments > 0 && (
                    <div className="inline-flex items-center gap-0.5 text-[9px] text-bad" title={`${c.openMoments} abierto(s)`}>
                      <AlertCircle size={8} strokeWidth={1.75} />
                      {c.openMoments > 1 && <span className="font-mono">{c.openMoments}</span>}
                    </div>
                  )}
                  {c.resolvedMoments > 0 && (
                    <div className="inline-flex items-center gap-0.5 text-[9px] text-ok" title={`${c.resolvedMoments} resuelto(s)`}>
                      <CheckCircle2 size={8} strokeWidth={1.75} />
                      {c.resolvedMoments > 1 && <span className="font-mono">{c.resolvedMoments}</span>}
                    </div>
                  )}
                  {c.interactionValue == null && c.openMoments === 0 && c.resolvedMoments === 0 && (
                    <Circle size={8} strokeWidth={1.75} className="text-muted-foreground/30" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground/70">
            <div className="flex items-center gap-1"><MessageCircle size={9} /> tono interacción</div>
            <div className="flex items-center gap-1 text-bad"><AlertCircle size={9} /> abierto</div>
            <div className="flex items-center gap-1 text-ok"><CheckCircle2 size={9} /> resuelto</div>
            <div className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-bad/20" /> regla</div>
            <div className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-ok/20" /> mid/ovu</div>
            <div className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-brand/20" /> lútea</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
