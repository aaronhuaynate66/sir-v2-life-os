'use client'

// SIR V2 — Horizonte del ciclo (rediseño ficha · módulo protagonista, opción 6a).
//
// Línea de tiempo continua: ciclo REAL hacia atrás + PREDICHO hacia adelante
// (tramado), cruzado con eventos de pareja/calendario, cada uno con su día+fase
// + una lectura de CUIDADO. Chips para mostrar/ocultar eventos. Reusa el engine
// puro buildCycleHorizon (posiciones en %).
//
// TANDA 3 (Horizonte pulido):
//   - THEME-AWARE: los colores viven en tokens (.sir-horizon + tokens globales
//     foreground/primary/border/success). Ya no hay hex que asuman fondo oscuro
//     → sobrevive al tema claro.
//   - LEGIBILIDAD/A11Y: piso de fuente 11px, tap targets ≥24px en los chips,
//     aria-pressed + indicador NO cromático (✓ / tachado) para mostrar/ocultar.
//   - SÍNTESIS PRIMERO: arriba, una lectura corta (fase actual + timing);
//     la línea de tiempo detallada queda colapsada por defecto.
//
// LÍNEA ÉTICA (doc 17): timing y presencia, NUNCA presión ni descalificación.

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { computeCycleRegularity } from '@/lib/ciclo/regularity'
import { cyclePhase } from '@/lib/ciclo/phase'
import { synthesisCue } from '@/lib/ciclo/horizonCue'
import { buildCycleHorizon, gatherHorizonEvents, type HorizonEvent, type BandPhase } from '@/lib/ciclo/horizon'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'
import type { SpecialDate } from '@/types'

const HORIZON_BACK_DAYS = 28
const HORIZON_FWD_DAYS = 67

// Cada fase → su token RGB (definido en globals.css, .sir-horizon). El alpha lo
// pone pasado/futuro. rgb(R G B / A) es theme-aware (los hues de fase son
// intrínsecos; las neutras salen de los tokens globales).
const PHASE_VAR: Record<BandPhase, string> = {
  menstrual: '--h-menstrual',
  follicular: '--h-follicular',
  ovulation: '--h-ovulation',
  luteal: '--h-luteal',
  spm: '--h-spm',
}
const PHASE_LABEL: Record<BandPhase, string> = {
  menstrual: 'menstrual', follicular: 'folicular', ovulation: 'ovulación', luteal: 'lútea', spm: 'SPM',
}

/** Relleno de una fase con alpha (theme-aware vía token). */
function phaseFill(phase: BandPhase, alpha: number): string {
  return `rgb(var(${PHASE_VAR[phase]}) / ${alpha})`
}

// El tramado del futuro usa el color de FONDO a baja opacidad: en tema oscuro
// son líneas oscuras, en claro son claras — en ambos "sombrea" la predicción.
const TRAMADO = 'repeating-linear-gradient(135deg,hsl(var(--background)/.32) 0 5px,transparent 5px 11px)'

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtShort(dateIso: string): string {
  try { return new Date(`${dateIso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) } catch { return dateIso }
}
/** ♥ pareja (mesario/aniversario), ★ cumple, ◆ resto. */
function eventGlyph(kind: HorizonEvent['kind']): string {
  if (kind === 'mesario' || kind === 'anniversary' || kind === 'partner') return '♥'
  if (kind === 'birthday') return '★'
  return '◆'
}
/** Color de evento (theme-aware): pareja/cumple = violeta token, resto = gris
 *  token; el pasado va más tenue que el futuro. */
function eventColor(kind: HorizonEvent['kind'], isFuture: boolean): string {
  const partner = kind === 'mesario' || kind === 'anniversary' || kind === 'partner' || kind === 'birthday'
  const v = partner ? '--h-partner' : '--h-neutral'
  return `rgb(var(${v}) / ${isFuture ? 0.95 : 0.6})`
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
  cycleStartDate, cycleLengthDays, personCycles = [], specialDates = [], birthDate, personName,
}: CycleHorizonCardProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState(false)

  const model = useMemo(() => {
    if (!cycleStartDate) return null
    const now = new Date()
    const fromIso = iso(new Date(now.getTime() - HORIZON_BACK_DAYS * 86_400_000))
    const toIso = iso(new Date(now.getTime() + HORIZON_FWD_DAYS * 86_400_000))
    const events = gatherHorizonEvents({ specialDates, birthDate, personName, fromIso, toIso, now })
    const reg = computeCycleRegularity(personCycles.map((e) => ({ date: e.date, phase: e.phase })))
    const horizon = buildCycleHorizon(
      { lastPeriodStart: cycleStartDate.slice(0, 10), cycleLengthDays: cycleLengthDays ?? 28, bandDays: reg.bandDays, events, horizonFrom: fromIso, horizonTo: toIso },
      now,
    )
    const cp = cyclePhase(cycleStartDate.slice(0, 10), cycleLengthDays ?? 28, now)
    return { horizon, reg, fromIso, toIso, confirmedIso: cycleStartDate.slice(0, 10), cp }
  }, [cycleStartDate, cycleLengthDays, personCycles, specialDates, birthDate, personName])

  if (!model?.horizon) return null
  const { horizon, reg, fromIso, toIso, confirmedIso, cp } = model
  if (horizon.events.length === 0) return null

  const shown = horizon.events.filter((e) => !hidden.has(e.label))
  const toggle = (label: string) => setHidden((prev) => {
    const next = new Set(prev)
    if (next.has(label)) next.delete(label); else next.add(label)
    return next
  })

  // Pins en 3 niveles: greedy anti-colisión por proximidad de %.
  const rows: HorizonEvent[][] = [[], [], []]
  for (const ev of shown) {
    const r = rows.findIndex((row) => row.every((o) => Math.abs(o.pct - ev.pct) > 9))
    rows[(r === -1 ? 2 : r)].push(ev)
  }

  const cue = cp ? synthesisCue(cp) : null
  const cueColor = cue?.tone === 'good' ? 'text-ok' : cue?.tone === 'care' ? 'text-warn' : 'text-muted-foreground'

  return (
    <Card className="sir-horizon shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-3">
        {/* ─── Síntesis (siempre visible) ─────────────────────────────── */}
        <div className="space-y-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
            Horizonte del ciclo
          </span>
          {cp ? (
            <p className="text-sm text-foreground leading-relaxed">
              Ahora: <span className="font-medium">{cp.label}</span>, día {cp.cycleDay}
              <span className="text-muted-foreground"> · próximo período en ~{cp.daysUntilNextPeriod} d</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Estimación del ciclo pendiente de datos.</p>
          )}
          {cue && <p className={cn('text-[13px] leading-relaxed', cueColor)}>{cue.text}</p>}
        </div>

        {/* Toggle a la línea de tiempo detallada. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground min-h-[24px]"
        >
          <ChevronDown size={14} strokeWidth={2} className={cn('transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
          {expanded ? 'Ocultar línea de tiempo' : 'Ver línea de tiempo del ciclo'}
        </button>

        {expanded && (<>
        {/* Rango + regularidad */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
            {fmtShort(fromIso)} — {fmtShort(toIso)} · período confirmado {fmtShort(confirmedIso)}
            {reg.meanLengthDays ? ` · ciclo ~${reg.meanLengthDays} días` : ''}
          </span>
          {reg.regularity !== 'insufficient' && reg.bandDays > 0 && (
            <span className="text-[11px] text-muted-foreground">predicción ±{reg.bandDays}d · se recalibra con cada período</span>
          )}
        </div>

        {/* Chips de eventos (tap target ≥24px, aria-pressed, indicador no cromático) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary mr-1">Fechas</span>
          {horizon.events.map((ev) => {
            const on = !hidden.has(ev.label)
            return (
              <button
                key={ev.label + ev.date}
                type="button"
                onClick={() => toggle(ev.label)}
                aria-pressed={on}
                title={on ? 'Mostrando — clic para ocultar' : 'Oculto — clic para mostrar'}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] min-h-[24px] transition-colors',
                  on
                    ? 'border-brand/45 bg-brand/10 text-brand-soft-foreground'
                    : 'border-border text-muted-foreground line-through decoration-muted-foreground/50',
                )}
              >
                <span aria-hidden="true">{on ? '✓' : '＋'}</span>
                {eventGlyph(ev.kind)} {ev.label} · {fmtShort(ev.date)}
              </button>
            )
          })}
        </div>

        {/* Pins (3 niveles) + HOY */}
        <div className="relative" style={{ height: 62 }}>
          {rows.map((row, ri) => row.map((ev) => (
            <span
              key={ev.label + ev.date}
              className="absolute whitespace-nowrap text-[11px]"
              style={{ left: `${ev.pct}%`, bottom: 42 - ri * 18, transform: 'translateX(-50%)', color: eventColor(ev.kind, ev.isFuture) }}
            >
              {eventGlyph(ev.kind)} {ev.label.length > 18 ? ev.label.slice(0, 17) + '…' : ev.label}
            </span>
          )))}
          <span
            className="absolute bottom-0 whitespace-nowrap rounded-[5px] px-2 py-0.5 font-mono text-[11px] font-semibold"
            style={{ left: `${horizon.todayPct}%`, transform: 'translateX(-50%)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            HOY
          </span>
        </div>

        {/* Banda de fases */}
        <div className="relative" style={{ height: 36 }}>
          <div className="relative h-full overflow-hidden rounded-lg">
            {horizon.band.map((seg, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${seg.fromPct}%`,
                  width: `${Math.max(0, seg.toPct - seg.fromPct)}%`,
                  background: phaseFill(seg.phase, seg.isFuture ? 0.24 : 0.55),
                }}
              />
            ))}
          </div>
          {/* Overlay tramado sobre el futuro */}
          <div className="pointer-events-none absolute top-0 bottom-0 rounded-r-lg" style={{ left: `${horizon.todayPct}%`, right: 0, background: TRAMADO }} />
          {/* Líneas verticales de eventos */}
          {shown.map((ev) => (
            <div key={ev.label + ev.date} className="absolute" style={{ left: `${ev.pct}%`, top: -5, bottom: -5, width: 1.5, background: eventColor(ev.kind, ev.isFuture) }} />
          ))}
          {/* Divisor HOY */}
          <div className="absolute z-10" style={{ left: `${horizon.todayPct}%`, top: -7, bottom: -7, width: 2, background: 'hsl(var(--primary))', borderRadius: 1 }} />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[11px] tracking-[0.1em]" style={{ color: 'hsl(var(--foreground) / 0.6)' }}>← REAL</span>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] tracking-[0.1em]" style={{ color: 'hsl(var(--foreground) / 0.45)' }}>PREDICCIÓN →</span>
        </div>

        {/* Regla del día de ciclo */}
        <div className="relative" style={{ height: 16 }}>
          {horizon.periodMarkers.map((m, i) => (
            <span key={`p${i}`} className="absolute font-mono text-[11px] font-medium" style={{ left: `${m.pct}%`, transform: 'translateX(-50%)', color: 'rgb(var(--h-menstrual))' }}>
              d1
            </span>
          ))}
          {horizon.ovulationMarkers.map((m, i) => (
            <span key={`o${i}`} className="absolute font-mono text-[11px]" style={{ left: `${m.pct}%`, transform: 'translateX(-50%)', color: 'hsl(var(--muted-foreground))' }}>
              d14
            </span>
          ))}
        </div>

        {/* Tono por día (proyección por fase del ciclo) */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between flex-wrap gap-x-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">Tono típico por fase · proyección</span>
            <span className="text-[11px] text-muted-foreground">pico ~ovulación · valle SPM</span>
          </div>
          <div className="relative" style={{ height: 34 }}>
            {horizon.toneSeries.map((t, i) => (
              <div
                key={i}
                className="absolute bottom-0"
                style={{ left: `${t.pct}%`, width: 3, transform: 'translateX(-50%)', height: `${Math.round(t.value * 100)}%`, background: `hsl(var(--success) / ${t.isFuture ? 0.28 : 0.55})`, borderRadius: 1 }}
              />
            ))}
            <div className="absolute" style={{ left: `${horizon.todayPct}%`, top: -3, bottom: -3, width: 2, background: 'hsl(var(--foreground) / 0.35)', borderRadius: 1 }} />
          </div>
        </div>

        {/* Ventanas para proponer (folicular→ovulación) */}
        {horizon.proposeWindows.length > 0 && (
          <div className="relative" style={{ height: 24 }}>
            {horizon.proposeWindows.map((w, i) => (
              <div key={i} className="absolute top-1 flex flex-col gap-1" style={{ left: `${Math.max(0, w.fromPct)}%`, width: `${Math.min(100, w.toPct) - Math.max(0, w.fromPct)}%` }}>
                <span className="block rounded-sm" style={{ height: 4, background: 'hsl(var(--success) / 0.6)' }} />
                <span className="whitespace-nowrap text-[11px] text-ok">▲ buen momento para proponer</span>
              </div>
            ))}
          </div>
        )}

        {/* Tarjetas de lectura por evento */}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.filter((e) => e.isFuture).slice(0, 6).map((ev) => (
            <div key={ev.label + ev.date} className="rounded-[9px] border border-border bg-secondary/40 p-3">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-[12px] font-medium" style={{ color: eventColor(ev.kind, true) }}>
                  {eventGlyph(ev.kind)} {ev.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {fmtShort(ev.date)} → día {ev.cycleDay}, {ev.isPms ? 'SPM' : PHASE_LABEL[ev.phase]}{ev.uncertainDays ? ` ±${ev.uncertainDays}d` : ''}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-foreground/85 mt-1.5">{ev.reading}</p>
            </div>
          ))}
        </div>

        <span className="block text-[11px] text-muted-foreground leading-relaxed">
          Cruce del ciclo estimado con tus fechas — para elegir el mejor momento y cuidado, no para presionar. La predicción es orientativa (±días) y se recalibra con cada período confirmado.
        </span>
        </>)}
      </CardContent>
    </Card>
  )
}
