'use client'
// SIR V2 — Briefing de cuidado, CONTROLADO por la fecha seleccionada del Estudio.
//
// Ya no está clavado al evento más cercano: renderiza el brief de la FECHA que el
// usuario elige (arrastrando el cursor del horizonte, tocando un chip de evento, o
// eligiendo una fecha libre "¿qué pasaría si…?"). Tres estados: evento real /
// simulación (fecha libre) / hoy. Reusa buildEventCareBrief (puro).
//
// LÍNEA ÉTICA (doc 17): la simulación es ANTICIPACIÓN DE CUIDADO — "para llegar
// preparado, que ella la pase mejor" — NUNCA "elegir la fecha para sacar ventaja".
// El caveat va siempre visible.

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { HeartHandshake, Sparkles, Wand2, CalendarClock } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { computeCycleRegularity } from '@/lib/ciclo/regularity'
import { buildEventCareBrief, type EventCareBrief } from '@/lib/ciclo/eventCareBrief'
import type { ScrubMode } from '@/lib/ciclo/cycleScrub'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'
import type { PersonalEvent } from '@/lib/personal-events/types'

export interface EventCareBriefCardProps {
  cycleStartDate: string
  cycleLengthDays?: number | null
  personCycles?: PersonCycleEntry[]
  personId: string
  personName: string
  personalEvents: PersonalEvent[]
  now: Date
  selectedDate: string | null
  mode: ScrubMode
  selectedEventId: string | null
  onSelectDate: (iso: string, mode: 'whatif' | 'event', eventId?: string | null) => void
  onToday: () => void
  onPlanSaved: () => void
}

const PHASE_COLOR: Record<string, string> = {
  menstrual: 'var(--h-menstrual)', follicular: 'var(--h-follicular)',
  ovulation: 'var(--h-ovulation)', luteal: 'var(--h-luteal)',
}
const CONF_LABEL: Record<EventCareBrief['confidence'], { t: string; c: string }> = {
  alta: { t: 'estimación firme', c: 'text-ok' },
  media: { t: 'estimación orientativa', c: 'text-warn' },
  baja: { t: 'estimación amplia — se afina con cada período que registres', c: 'text-bad' },
}

function fmt(iso: string): string {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' }) } catch { return iso }
}
function fmtShort(iso: string): string {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) } catch { return iso }
}
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function EventCareBriefCard(props: EventCareBriefCardProps) {
  const { cycleStartDate, cycleLengthDays, personCycles = [], personId, personName, personalEvents, now, selectedDate, mode, selectedEventId, onSelectDate, onToday, onPlanSaved } = props
  const firstName = personName.split(' ')[0] || personName
  const todayIso = isoOf(now)
  const effIso = selectedDate ?? todayIso

  const upcoming = useMemo(
    () => personalEvents.filter((e) => e.personId === personId && e.date >= todayIso).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 12),
    [personalEvents, personId, todayIso],
  )

  const selectedEvent = selectedEventId ? personalEvents.find((e) => e.id === selectedEventId) : undefined
  const label = mode === 'event' && selectedEvent ? selectedEvent.title
    : mode === 'whatif' ? `Escenario · ${fmt(effIso)}`
      : 'Hoy'

  const brief = useMemo(() => {
    const reg = computeCycleRegularity(personCycles.map((e) => ({ date: e.date, phase: e.phase })))
    return buildEventCareBrief({
      eventLabel: label, eventDateIso: effIso,
      lastPeriodStart: cycleStartDate.slice(0, 10), cycleLengthDays: cycleLengthDays ?? 28,
      bandDays: reg.bandDays, now,
    })
  }, [label, effIso, cycleStartDate, cycleLengthDays, personCycles, now])

  if (!brief) return null

  return (
    <Card className="sir-horizon shadow-none mb-4 border-brand/30">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <HeartHandshake size={15} strokeWidth={1.75} className="text-brand-soft-foreground" aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-soft-foreground">
            Cómo llega {firstName} — elegí el día
          </span>
        </div>

        {/* Navegador de fecha: eventos + hoy + "¿qué pasaría si?" (fecha libre). */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button" onClick={onToday}
            className={cn('rounded-full border px-2.5 py-1 text-[11px] min-h-[28px] transition-colors',
              mode === 'today' ? 'border-brand/50 bg-brand/10 text-brand-soft-foreground' : 'border-border text-muted-foreground hover:border-brand/40')}
          >Hoy</button>
          {upcoming.map((ev) => (
            <button
              key={ev.id} type="button" onClick={() => onSelectDate(ev.date, 'event', ev.id)}
              className={cn('rounded-full border px-2.5 py-1 text-[11px] min-h-[28px] transition-colors',
                selectedEventId === ev.id ? 'border-brand/50 bg-brand/10 text-brand-soft-foreground' : 'border-border text-muted-foreground hover:border-brand/40')}
              title={`${ev.title} · ${fmtShort(ev.date)}`}
            >♥ {ev.title.length > 16 ? ev.title.slice(0, 15) + '…' : ev.title} · {fmtShort(ev.date)}</button>
          ))}
          <label className={cn('relative inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] min-h-[28px] cursor-pointer transition-colors',
            mode === 'whatif' ? 'border-brand/50 bg-brand/10 text-brand-soft-foreground' : 'border-border text-muted-foreground hover:border-brand/40')}>
            <Wand2 size={12} strokeWidth={1.75} aria-hidden="true" />
            ¿qué pasaría si…?
            <input
              type="date" value={mode === 'whatif' ? effIso : ''} min={todayIso}
              onChange={(e) => e.target.value && onSelectDate(e.target.value, 'whatif', null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Elegí una fecha para simular"
            />
          </label>
        </div>

        <MainBrief brief={brief} mode={mode} color={PHASE_COLOR[brief.phase] ?? 'var(--h-luteal)'} conf={CONF_LABEL[brief.confidence]} />

        {/* Guardar la simulación como plan real con la persona. */}
        {mode === 'whatif' && (
          <SaveAsPlan personId={personId} firstName={firstName} dateIso={effIso} onSaved={onPlanSaved} />
        )}

        {/* SIR lo lee a fondo (IA) — solo para eventos reales (aterriza en lo que sabe). */}
        {mode === 'event' && selectedEvent && (
          <DeepRead personId={personId} eventLabel={selectedEvent.title} eventDate={selectedEvent.date} />
        )}
      </CardContent>
    </Card>
  )
}

function MainBrief({ brief, mode, color, conf }: { brief: EventCareBrief; mode: ScrubMode; color: string; conf: { t: string; c: string } }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-[15px] font-semibold text-foreground">
          {mode === 'whatif' ? '◇ ' : mode === 'event' ? '♥ ' : '· '}{brief.eventLabel}
        </span>
        {mode !== 'whatif' && (
          <span className="text-[12px] text-muted-foreground font-mono">{fmt(brief.eventDateIso)} · {brief.daysUntilEvent <= 0 ? 'hoy' : brief.daysUntilEvent === 1 ? 'mañana' : `en ${brief.daysUntilEvent} días`}</span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
          style={{ background: `rgb(${color} / 0.16)`, color: `rgb(${color})` }}>
          <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${color})` }} />
          {brief.headline}
        </span>
        <span className={cn('text-[11px]', conf.c)}>{conf.t}</span>
      </div>

      <EnergyChart brief={brief} color={color} />

      <p className="text-[13px] leading-relaxed text-foreground/90">{brief.stateRead}</p>

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

function EnergyChart({ brief, color }: { brief: EventCareBrief; color: string }) {
  const max = Math.max(...brief.energyCurve, 0.01)
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height: 40 }} aria-hidden="true">
        {brief.energyCurve.map((v, i) => {
          const isEvent = i + 1 === brief.cycleDay
          return (
            <div key={i} className="flex-1 rounded-t-[1px]"
              style={{ height: `${Math.max(6, Math.round((v / max) * 100))}%`, background: isEvent ? `rgb(${color})` : 'hsl(var(--foreground) / 0.14)' }}
              title={`día ${i + 1}`} />
          )
        })}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>d1 · regla</span>
        <span style={{ color: `rgb(${color})` }}>▲ el día que elegiste (día {brief.cycleDay})</span>
        <span>energía · pico ~ovulación</span>
      </div>
    </div>
  )
}

function SaveAsPlan({ personId, firstName, dateIso, onSaved }: { personId: string; firstName: string; dateIso: string; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    const t = title.trim()
    if (!t) { toast.error('Ponele un nombre al plan'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/personal-events', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t, date: dateIso, personId }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error('No se pudo guardar', { description: e?.error }); return }
      toast.success('Plan guardado', { description: `${t} — cae en la línea de ${firstName}.` })
      onSaved()
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }
  return (
    <div className="rounded-md border border-brand/25 bg-brand-soft/15 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-brand-soft-foreground">
        <CalendarClock size={13} strokeWidth={1.75} aria-hidden="true" /> ¿Lo hacés plan? Cae en la línea de {firstName}.
      </div>
      <div className="flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Ej: Viaje con ${firstName}`} className="text-[13px]" />
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </div>
  )
}

function DeepRead({ personId, eventLabel, eventDate }: { personId: string; eventLabel: string; eventDate: string }) {
  const [deep, setDeep] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  async function read() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/ciclo/event-brief', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId, eventLabel, eventDate }),
      })
      const data = await res.json().catch(() => ({}))
      setDeep(res.ok && data?.text ? data.text : `No pude leerlo a fondo${data?.error ? `: ${data.error}` : ''}.`)
    } catch { setDeep('No pude leerlo a fondo (revisá tu conexión).') } finally { setLoading(false) }
  }
  return (
    <div className="pt-1">
      {!deep ? (
        <Button size="sm" variant="outline" onClick={read} disabled={loading} className="text-[12px]">
          <Wand2 size={13} strokeWidth={1.75} className="mr-1.5" />
          {loading ? 'SIR lo está leyendo…' : 'SIR lo lee a fondo'}
        </Button>
      ) : (
        <div className="rounded-md border border-brand/25 bg-brand-soft/15 p-3 text-[13px] leading-relaxed text-foreground/90 whitespace-pre-line">{deep}</div>
      )}
    </div>
  )
}
