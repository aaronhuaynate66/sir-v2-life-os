// SIR V2 — CalendarPanel: eventos próximos del feed Outlook (.ics).
//
// Consume /api/calendar (server lee OUTLOOK_ICS_URL; el token nunca llega acá).
// Degrada limpio: si no está configurado, muestra cómo activarlo; si falla,
// lo dice sin romper. Agrupa por día en TZ Lima.
'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Clock, MapPin, Settings2, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { LIMA_TZ_LABEL } from '@/lib/calendar/tz'
import type { CalendarEvent, CalendarFeedResult } from '@/lib/calendar/types'

const cardClass = 'shadow-none mb-6'
const LIMA_TZ = 'America/Lima'

// ─── Helpers de formato en TZ Lima ──────────────────────────────────

/** ISO UTC → 'YYYY-MM-DD' en Lima. Para all-day, start ya es date-only. */
function limaDateKey(ev: CalendarEvent): string {
  if (ev.allDay) return ev.start
  return new Intl.DateTimeFormat('en-CA', { timeZone: LIMA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ev.start))
}

function limaTime(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: LIMA_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

/** 'YYYY-MM-DD' → encabezado humano ("Hoy", "Mañana", o "lun 1 jun"). */
function dayHeader(dateKey: string, todayKey: string, tomorrowKey: string): string {
  if (dateKey === todayKey) return 'Hoy'
  if (dateKey === tomorrowKey) return 'Mañana'
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12)) // mediodía evita shift
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(dt)
}

function todayKeyLima(offsetDays = 0): string {
  const ms = Date.now() + offsetDays * 86_400_000
  return new Intl.DateTimeFormat('en-CA', { timeZone: LIMA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
}

interface DayGroup {
  dateKey: string
  events: CalendarEvent[]
}

function groupByDay(events: CalendarEvent[]): DayGroup[] {
  const map = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    const k = limaDateKey(ev)
    const arr = map.get(k) ?? []
    arr.push(ev)
    map.set(k, arr)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateKey, evs]) => ({
      dateKey,
      events: evs.sort((a, b) => a.start.localeCompare(b.start)),
    }))
}

// ─── Componente ─────────────────────────────────────────────────────

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: CalendarFeedResult }

export function CalendarPanel({ reloadKey = 0 }: { reloadKey?: number }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/calendar', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as CalendarFeedResult
        if (!cancelled) setState({ kind: 'ready', data })
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: e instanceof Error ? e.message : 'error' })
      }
    })()
    return () => { cancelled = true }
  }, [reloadKey])

  return (
    <Card className={cardClass}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={CalendarDays} label="Calendario" />
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{LIMA_TZ_LABEL}</span>
        </div>
        <Body state={state} />
      </CardContent>
    </Card>
  )
}

function Body({ state }: { state: State }) {
  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') {
    return <Note icon={AlertCircle} tone="warn">No pude consultar el calendario ({state.message}).</Note>
  }

  const { configured, events, error } = state.data
  if (!configured) return <NotConfigured />
  if (error && events.length === 0) {
    return <Note icon={AlertCircle} tone="warn">No pude leer el feed: {error}. Revisá la URL de OUTLOOK_ICS_URL.</Note>
  }
  if (events.length === 0) {
    return <Note icon={CalendarDays} tone="muted">Sin eventos próximos en el calendario.</Note>
  }

  const todayKey = todayKeyLima(0)
  const tomorrowKey = todayKeyLima(1)
  const groups = groupByDay(events)

  return (
    <div className="space-y-4 mt-1">
      {error && (
        <p className="text-[10px] text-warn/80">Mostrando última copia (no pude refrescar: {error}).</p>
      )}
      {groups.map((g) => (
        <div key={g.dateKey}>
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1.5">
            {dayHeader(g.dateKey, todayKey, tomorrowKey)}
          </div>
          <ul className="space-y-1.5">
            {g.events.map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function EventRow({ ev }: { ev: CalendarEvent }) {
  return (
    <li className="flex items-start gap-3 rounded-md px-2 py-1.5 -mx-2 hover:bg-accent/10 transition-colors">
      <div className="flex-shrink-0 w-14 pt-0.5">
        {ev.allDay ? (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Todo el día</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-foreground/80">
            <Clock size={11} strokeWidth={1.75} className="text-muted-foreground/50" aria-hidden="true" />
            {limaTime(ev.start)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground truncate">{ev.title}</div>
        {ev.location && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
            <MapPin size={10} strokeWidth={1.75} className="flex-shrink-0 text-muted-foreground/50" aria-hidden="true" />
            <span className="truncate">{ev.location}</span>
          </div>
        )}
      </div>
    </li>
  )
}

function Loading() {
  return (
    <div className="space-y-2 mt-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-1.5">
          <div className="w-12 h-3 rounded bg-muted/40 animate-pulse" />
          <div className="flex-1 h-3.5 rounded bg-muted/40 animate-pulse" />
        </div>
      ))}
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="mt-2 rounded-md border border-dashed border-border/70 bg-muted/20 p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Settings2 size={14} strokeWidth={1.75} className="text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground/90">Conectá tu calendario de Outlook</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        En Outlook, publicá tu calendario y copiá la URL <span className="font-mono text-foreground/80">.ics</span>.
        Agregá esa URL como variable de entorno{' '}
        <span className="font-mono text-foreground/80">OUTLOOK_ICS_URL</span> en Vercel
        (Project → Settings → Environment Variables) y volvé a deployar.
      </p>
      <p className="text-[10px] text-muted-foreground/60 mt-2 leading-relaxed">
        Tu token de calendario queda solo en el servidor — nunca se expone en el navegador.
        Eventos en {LIMA_TZ_LABEL}.
      </p>
    </div>
  )
}

function Note({ icon: Icon, tone, children }: { icon: typeof CalendarDays; tone: 'warn' | 'muted'; children: React.ReactNode }) {
  const color = tone === 'warn' ? 'text-warn' : 'text-muted-foreground/40'
  return (
    <div className="text-center py-6">
      <Icon size={20} strokeWidth={1.5} className={`${color} mx-auto mb-2`} aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
