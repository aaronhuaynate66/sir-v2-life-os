'use client'
// SIR V2 — "Mejor fecha para un viaje/plan largo" con la persona.
//
// Elegís un mes + el largo del viaje y SIR rankea las ventanas por SU ciclo:
// primero los tramos de más energía/resto. Tocás una → el briefing se mueve a esa
// fecha. CUIDADO, no ventaja (doc 17): "¿cuándo la va a disfrutar más?", no
// "cuándo dice que sí". Orientativo (±días), se recalibra con cada período.

import { useMemo, useState } from 'react'
import { Plane, ChevronRight } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { computeCycleRegularity } from '@/lib/ciclo/regularity'
import { rankTravelWindows, windowLabel, type TravelWindow } from '@/lib/ciclo/travelWindows'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'

export interface TravelPlannerCardProps {
  cycleStartDate: string
  cycleLengthDays?: number | null
  personCycles?: PersonCycleEntry[]
  personName: string
  now: Date
  onSelectDate: (iso: string, mode: 'whatif') => void
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtShort(iso: string): string {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return iso }
}
function energyTone(w: TravelWindow): { cls: string; mark: string } {
  if (w.avgEnergy >= 0.72 && w.lowDays === 0) return { cls: 'text-ok', mark: '▲' }
  if (w.avgEnergy >= 0.5) return { cls: 'text-warn', mark: '◆' }
  return { cls: 'text-bad', mark: '▽' }
}

const TRIP_OPTS = [
  { days: 2, label: 'Finde (2d)' },
  { days: 3, label: 'Finde largo (3d)' },
  { days: 5, label: '5 días' },
  { days: 7, label: 'Semana' },
]

export function TravelPlannerCard({ cycleStartDate, cycleLengthDays, personCycles = [], personName, now, onSelectDate }: TravelPlannerCardProps) {
  const firstName = personName.split(' ')[0] || personName
  const todayIso = isoOf(now)
  // Default: el mes que viene.
  const [ym, setYm] = useState(() => { const d = new Date(now.getFullYear(), now.getMonth() + 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [tripDays, setTripDays] = useState(3)
  const [onlyWeekends, setOnlyWeekends] = useState(true)

  const windows = useMemo(() => {
    const [y, m] = ym.split('-').map(Number)
    if (!y || !m) return []
    const first = `${ym}-01`
    const fromIso = first < todayIso ? todayIso : first
    const toIso = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    const reg = computeCycleRegularity(personCycles.map((e) => ({ date: e.date, phase: e.phase })))
    return rankTravelWindows({
      lastPeriodStart: cycleStartDate.slice(0, 10), cycleLengthDays: cycleLengthDays ?? 28,
      bandDays: reg.bandDays, fromIso, toIso, tripDays, onlyWeekends, now, limit: 6,
    })
  }, [ym, tripDays, onlyWeekends, cycleStartDate, cycleLengthDays, personCycles, now, todayIso])

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Plane size={15} strokeWidth={1.75} className="text-muted-foreground/80" aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
            Mejor fecha para un plan largo con {firstName}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={ym} min={`${todayIso.slice(0, 7)}`} onChange={(e) => e.target.value && setYm(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12px] font-mono min-h-[32px]" aria-label="Mes a explorar" />
          <select value={tripDays} onChange={(e) => setTripDays(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12px] min-h-[32px]" aria-label="Largo del viaje">
            {TRIP_OPTS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
          </select>
          <button type="button" onClick={() => setOnlyWeekends((v) => !v)} aria-pressed={onlyWeekends}
            className={cn('rounded-full border px-2.5 py-1 text-[11px] min-h-[32px] transition-colors',
              onlyWeekends ? 'border-brand/50 bg-brand/10 text-brand-soft-foreground' : 'border-border text-muted-foreground')}>
            solo findes
          </button>
        </div>

        {windows.length === 0 ? (
          <p className="text-[12px] text-muted-foreground italic">No hay ventanas en ese mes con esos filtros. Prueba sin «solo findes» o cambia el mes.</p>
        ) : (
          <ul className="space-y-1.5">
            {windows.map((w, i) => {
              const t = energyTone(w)
              return (
                <li key={w.startIso}>
                  <button type="button" onClick={() => onSelectDate(w.startIso, 'whatif')}
                    className="w-full text-left flex items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2 hover:border-brand/40 transition-colors group">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground">
                        {i === 0 && <span className="text-ok mr-1">★</span>}
                        {fmtShort(w.startIso)} — {fmtShort(w.endIso)}
                      </div>
                      <div className={cn('text-[11px]', t.cls)}>{t.mark} {windowLabel(w)}{w.uncertaintyDays ? <span className="text-muted-foreground"> · ±{w.uncertaintyDays}d</span> : null}</div>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground/50 group-hover:text-foreground shrink-0" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground border-l-2 border-border/40 pl-3">
          Rankeado por su energía típica en cada tramo — para que la disfrute, no para forzar nada. Es una tendencia (±días) y se recalibra con cada período que registres. Toca una fecha para ver el detalle.
        </p>
      </CardContent>
    </Card>
  )
}
