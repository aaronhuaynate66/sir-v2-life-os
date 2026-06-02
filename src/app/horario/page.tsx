'use client'

// SIR V2 — /horario (P6): timeline operativo del día.
//
// Núcleo operativo sobre el feed de calendario (P5): bloque ACTUAL con
// countdown a su fin, PRÓXIMO bloque con countdown a su inicio, la línea de
// tiempo completa del día y detección de sobrecarga. TZ Lima.
//
// Degrada limpio: sin OUTLOOK_ICS_URL muestra cómo activarlo; el countdown
// corre client-side (tick cada segundo) sin tocar red.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Clock, Settings2, AlertCircle, CalendarDays, MapPin, Flame, ArrowRight } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton, SkeletonBlocks } from '@/components/skeletons/RouteSkeleton'
import { buildDayTimeline, type DayTimeline, type TimelineBlock, type OverloadLevel } from '@/lib/calendar/timeline'
import { LIMA_TZ_LABEL } from '@/lib/calendar/tz'
import type { CalendarEvent, CalendarFeedResult } from '@/lib/calendar/types'
import { cn } from '@/lib/utils'

const LIMA_TZ = 'America/Lima'

function limaTime(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: LIMA_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

/** ms → "2h 05m" o "05m 12s" (para countdowns cortos). */
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'ahora'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

const OVERLOAD_STYLE: Record<OverloadLevel, { text: string; border: string; bg: string }> = {
  ok: { text: 'text-ok', border: 'border-ok/30', bg: 'bg-ok-soft' },
  busy: { text: 'text-warn', border: 'border-warn/30', bg: 'bg-warn-soft' },
  overloaded: { text: 'text-bad', border: 'border-bad/30', bg: 'bg-bad-soft' },
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: CalendarFeedResult }

export default function HorarioPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={3} />
  return <HorarioContent />
}

function HorarioContent() {
  const [state, setState] = useState<FetchState>({ kind: 'loading' })
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // Fetch del feed (una vez al montar).
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
  }, [])

  // Tick cada segundo para el countdown en vivo.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const events: CalendarEvent[] = state.kind === 'ready' ? state.data.events : []
  const timeline = buildDayTimeline(events, nowMs)

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-6 sm:mb-8 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2 &mdash; Horario</div>
          <div className="flex items-center gap-3 mt-1">
            <Clock size={28} strokeWidth={1.5} className="text-muted-foreground" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Horario</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Tu día operativo, bloque a bloque.</p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mt-2">{LIMA_TZ_LABEL}</span>
      </motion.div>

      <Body state={state} timeline={timeline} nowMs={nowMs} />
    </AppShell>
  )
}

function Body({ state, timeline, nowMs }: { state: FetchState; timeline: DayTimeline; nowMs: number }) {
  // Ya estamos dentro del AppShell (HorarioContent) y el header ya se pintó:
  // usamos el cuerpo bare del skeleton, sin shell ni header duplicados.
  if (state.kind === 'loading') return <SkeletonBlocks cards={3} header={false} />
  if (state.kind === 'error') {
    return <Note tone="warn">No pude consultar el calendario ({state.message}).</Note>
  }
  if (!state.data.configured) return <NotConfigured />
  if (state.data.error && state.data.events.length === 0) {
    return <Note tone="warn">No pude leer el feed: {state.data.error}.</Note>
  }
  if (timeline.blocks.length === 0 && timeline.allDay.length === 0) {
    return <Note tone="muted">No hay nada agendado para hoy. Día libre. 🌤️</Note>
  }

  const o = OVERLOAD_STYLE[timeline.overload.level]
  const legend = (state.data.calendars ?? []).filter((c) => c.label)
  const showLegend = legend.length > 1

  return (
    <div className="space-y-5">
      {/* Leyenda de calendarios (multi-calendario) */}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {legend.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color ?? 'var(--brand)' }} aria-hidden="true" />
              {c.label}
            </span>
          ))}
        </div>
      )}
      {/* Sobrecarga */}
      {timeline.overload.level !== 'ok' && (
        <Card className={cn('shadow-none', o.border, o.bg)}>
          <CardContent className="p-4 flex items-center gap-3">
            <Flame size={16} strokeWidth={1.75} className={cn('flex-shrink-0', o.text)} aria-hidden="true" />
            <span className="text-sm text-foreground/90">{timeline.overload.reason}</span>
          </CardContent>
        </Card>
      )}

      {/* All-day */}
      {timeline.allDay.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {timeline.allDay.map((e) => (
            <Badge key={e.id} variant="brand" className="text-[11px] font-normal">
              <CalendarDays size={11} strokeWidth={1.75} className="mr-1" aria-hidden="true" />
              {e.title}
            </Badge>
          ))}
        </div>
      )}

      {/* AHORA / PRÓXIMO */}
      <NowNext timeline={timeline} nowMs={nowMs} />

      {/* Línea de tiempo completa */}
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-6">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-3">El día</div>
          <ol className="space-y-0.5">
            {timeline.blocks.map((b) => (
              <BlockRow key={b.event.id} block={b} nowMs={nowMs} />
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

function NowNext({ timeline, nowMs }: { timeline: DayTimeline; nowMs: number }) {
  const { current, next } = timeline
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* AHORA */}
      <Card className={cn('shadow-none', current ? 'border-primary/40 bg-primary/[0.05]' : '')}>
        <CardContent className="p-4 sm:p-5">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">Ahora</div>
          {current ? (
            <>
              <div className="text-lg font-semibold tracking-tight leading-tight">{current.event.title}</div>
              <div className="text-xs text-muted-foreground mt-1 font-mono tabular-nums">
                {limaTime(current.event.start)}{current.event.end ? `–${limaTime(current.event.end)}` : ''}
              </div>
              {current.event.location && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                  <MapPin size={10} strokeWidth={1.75} className="text-muted-foreground/50" aria-hidden="true" />
                  <span className="truncate">{current.event.location}</span>
                </div>
              )}
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">termina en</span>
                <span className="text-base font-mono tabular-nums text-primary">{formatCountdown(current.endMs - nowMs)}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-2">Sin bloque activo. Espacio libre.</div>
          )}
        </CardContent>
      </Card>

      {/* PRÓXIMO */}
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">Próximo</div>
          {next ? (
            <>
              <div className="text-lg font-semibold tracking-tight leading-tight">{next.event.title}</div>
              <div className="text-xs text-muted-foreground mt-1 font-mono tabular-nums">
                {limaTime(next.event.start)}{next.event.end ? `–${limaTime(next.event.end)}` : ''}
              </div>
              {next.event.location && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                  <MapPin size={10} strokeWidth={1.75} className="text-muted-foreground/50" aria-hidden="true" />
                  <span className="truncate">{next.event.location}</span>
                </div>
              )}
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">empieza en</span>
                <span className="text-base font-mono tabular-nums text-foreground">{formatCountdown(next.startMs - nowMs)}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-2">Nada más por hoy. 🌙</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BlockRow({ block, nowMs }: { block: TimelineBlock; nowMs: number }) {
  const isPast = block.status === 'past'
  const isCurrent = block.status === 'current'
  return (
    <li className={cn('flex items-center gap-3 py-2 border-b border-border/40 last:border-0', isPast && 'opacity-40')}>
      <div className="w-14 flex-shrink-0 text-xs font-mono tabular-nums text-muted-foreground">{limaTime(block.event.start)}</div>
      {block.event.calendarColor ? (
        <div
          className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isCurrent && 'animate-pulse')}
          style={{ backgroundColor: block.event.calendarColor }}
          aria-hidden="true"
          title={block.event.calendarLabel}
        />
      ) : (
        <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isCurrent ? 'bg-brand animate-pulse' : isPast ? 'bg-muted-foreground/40' : 'bg-muted-foreground/70')} aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm truncate', isCurrent ? 'text-foreground font-medium' : 'text-foreground/90')}>{block.event.title}</div>
        {block.event.location && <div className="text-[11px] text-muted-foreground truncate">{block.event.location}</div>}
      </div>
      {isCurrent && (
        <Badge variant="outline" className="text-[10px] font-mono border-primary/30 bg-primary/10 text-primary flex-shrink-0">
          {formatCountdown(block.endMs - nowMs)}
        </Badge>
      )}
    </li>
  )
}

function NotConfigured() {
  return (
    <Card className="shadow-none">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-1.5">
          <Settings2 size={16} strokeWidth={1.75} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground/90">Conectá tu calendario para ver tu horario</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          El horario operativo se arma desde tu calendario de Outlook. Publicá tu calendario,
          copiá la URL <span className="font-mono text-foreground/80">.ics</span> y agregala como
          variable <span className="font-mono text-foreground/80">OUTLOOK_ICS_URL</span> en Vercel.
          Tu token queda solo en el servidor.
        </p>
        <Link href="/agenda" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-3">
          Ver la agenda mientras tanto
          <ArrowRight size={12} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  )
}

function Note({ tone, children }: { tone: 'warn' | 'muted'; children: React.ReactNode }) {
  const Icon = tone === 'warn' ? AlertCircle : Clock
  const color = tone === 'warn' ? 'text-warn' : 'text-muted-foreground/40'
  return (
    <Card className="shadow-none">
      <CardContent className="p-8 text-center">
        <Icon size={22} strokeWidth={1.5} className={cn('mx-auto mb-2', color)} aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  )
}
