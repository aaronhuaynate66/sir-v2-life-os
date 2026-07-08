'use client'
// SIR V2 — Briefing de cuidado por evento (anticipación).
//
// Para el/los próximo(s) PLAN(es) con la persona (personal_events), SIR te dice
// EN QUÉ FASE Y ÁNIMO va a llegar ella, con un gráfico de energía y SUGERENCIAS
// concretas de cuidado (un detalle, flores, plan tranquilo, prepararte, intimidad
// como ternura). Anticipación para llegar preparado y cuidarla mejor.
//
// LÍNEA ÉTICA (doc 17): cuidado, no gestión. Tendencia, no certeza. La card lo
// dice explícito. Solo se monta en fichas afectivas (showCuidado).

import { useEffect, useMemo, useState } from 'react'
import { HeartHandshake, Sparkles } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { computeCycleRegularity } from '@/lib/ciclo/regularity'
import { buildEventCareBrief, type EventCareBrief } from '@/lib/ciclo/eventCareBrief'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'
import type { PersonalEvent } from '@/lib/personal-events/types'

export interface EventCareBriefCardProps {
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
  personCycles?: PersonCycleEntry[]
  personId?: string | null
  personName: string
  refreshKey?: number
}

const PHASE_COLOR: Record<string, string> = {
  menstrual: 'var(--h-menstrual)', follicular: 'var(--h-follicular)',
  ovulation: 'var(--h-ovulation)', luteal: 'var(--h-luteal)',
}

function fmt(dateIso: string): string {
  try { return new Date(`${dateIso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' }) } catch { return dateIso }
}
function countdown(days: number): string {
  if (days < 0) return 'ya pasó'
  if (days === 0) return 'es hoy'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}
const CONF_LABEL: Record<EventCareBrief['confidence'], { t: string; c: string }> = {
  alta: { t: 'estimación firme', c: 'text-ok' },
  media: { t: 'estimación orientativa', c: 'text-warn' },
  baja: { t: 'estimación amplia', c: 'text-bad' },
}

export function EventCareBriefCard({
  cycleStartDate, cycleLengthDays, personCycles = [], personId, personName, refreshKey = 0,
}: EventCareBriefCardProps) {
  const [events, setEvents] = useState<PersonalEvent[]>([])

  useEffect(() => {
    if (!cycleStartDate || !personId) return
    let alive = true
    fetch(`/api/personal-events?personId=${encodeURIComponent(personId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive && data && Array.isArray(data.events)) setEvents(data.events as PersonalEvent[]) })
      .catch(() => {})
    return () => { alive = false }
  }, [cycleStartDate, personId, refreshKey])

  const briefs = useMemo(() => {
    if (!cycleStartDate || !personId) return []
    const now = new Date()
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const reg = computeCycleRegularity(personCycles.map((e) => ({ date: e.date, phase: e.phase })))
    return events
      .filter((e) => e.personId === personId && e.date >= todayIso)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 3)
      .map((e) => buildEventCareBrief({
        eventLabel: e.title, eventDateIso: e.date,
        lastPeriodStart: cycleStartDate.slice(0, 10), cycleLengthDays: cycleLengthDays ?? 28,
        bandDays: reg.bandDays, now,
      }))
      .filter((b): b is EventCareBrief => b != null)
  }, [events, cycleStartDate, cycleLengthDays, personCycles, personId])

  if (briefs.length === 0) return null
  const firstName = personName.split(' ')[0] || personName
  const [main, ...rest] = briefs

  return (
    <Card className="sir-horizon shadow-none mb-4 border-brand/30">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <HeartHandshake size={15} strokeWidth={1.75} className="text-brand-soft-foreground" aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-soft-foreground">
            Cómo llega {firstName} a este plan
          </span>
        </div>

        <MainBrief brief={main} firstName={firstName} />

        {rest.length > 0 && (
          <div className="border-t border-border/40 pt-2.5 space-y-1">
            <div className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary">Después</div>
            {rest.map((b) => (
              <div key={b.eventLabel + b.eventDateIso} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="text-foreground/85 truncate">♥ {b.eventLabel}</span>
                <span className="text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                  {fmt(b.eventDateIso)} · {b.phaseLabel}{b.isPms ? ' · SPM' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MainBrief({ brief, firstName }: { brief: EventCareBrief; firstName: string }) {
  const color = PHASE_COLOR[brief.phase] ?? 'var(--h-luteal)'
  const conf = CONF_LABEL[brief.confidence]
  return (
    <div className="space-y-3">
      {/* Evento + countdown */}
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-[15px] font-semibold text-foreground">♥ {brief.eventLabel}</span>
        <span className="text-[12px] text-muted-foreground font-mono">{fmt(brief.eventDateIso)} · {countdown(brief.daysUntilEvent)}</span>
      </div>

      {/* Headline de fase + confianza */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
          style={{ background: `rgb(${color} / 0.16)`, color: `rgb(${color})` }}>
          <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${color})` }} />
          {brief.headline}
        </span>
        <span className={cn('text-[11px]', conf.c)}>{conf.t}</span>
      </div>

      {/* Gráfico: energía típica a lo largo del ciclo, con el día del evento marcado */}
      <EnergyChart brief={brief} color={color} />

      {/* Lectura del estado */}
      <p className="text-[13px] leading-relaxed text-foreground/90">{brief.stateRead}</p>

      {/* Sugerencias de cuidado */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary">Qué podés hacer</div>
        <ul className="space-y-1.5">
          {brief.suggestions.map((s, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-foreground/90">
              <Sparkles size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand-soft-foreground" aria-hidden="true" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground border-l-2 border-border/40 pl-3">{brief.caveat}</p>
    </div>
  )
}

/** Sparkline de energía típica por día del ciclo, con el día del evento resaltado. */
function EnergyChart({ brief, color }: { brief: EventCareBrief; color: string }) {
  const max = Math.max(...brief.energyCurve, 0.01)
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height: 40 }} aria-hidden="true">
        {brief.energyCurve.map((v, i) => {
          const day = i + 1
          const isEvent = day === brief.cycleDay
          return (
            <div
              key={i}
              className="flex-1 rounded-t-[1px]"
              style={{
                height: `${Math.max(6, Math.round((v / max) * 100))}%`,
                background: isEvent ? `rgb(${color})` : 'hsl(var(--foreground) / 0.14)',
              }}
              title={`día ${day}`}
            />
          )
        })}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>d1 · regla</span>
        <span style={{ color: `rgb(${color})` }}>▲ el día del plan (día {brief.cycleDay})</span>
        <span>energía · pico ~ovulación</span>
      </div>
    </div>
  )
}
