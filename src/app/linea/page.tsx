'use client'

// SIR V2 — /linea (AF·F1): timeline unificado cross-fuente.
//
// Tu vida en una sola línea: finanzas + ánimo + sueño + salud + eventos externos,
// fusionados y agrupados por día. "Pathfinder apuntado a tu propia vida" — para
// VERTE, no para vigilar. Motor puro `lib/timeline/unified`; las fuentes salen de
// los stores locales + /api/watched-events.

import { useEffect, useMemo, useState } from 'react'
import { GitCommitVertical, DollarSign, Activity, Moon, Heart, Radar } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useSelfStore } from '@/stores/useSelfStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { todayLimaKey } from '@/lib/dates/limaDay'
import { buildUnifiedTimeline, type TimelineItem, type TimelineSource, type TimelineTone } from '@/lib/timeline/unified'
import { getHealthMetricLabel } from '@/lib/health-metrics/labels'
import { AnomaliesCard } from '@/components/timeline/AnomaliesCard'
import { cn } from '@/lib/utils'

const MAX_DAYS = 45
const SRC: Record<TimelineSource, { label: string; Icon: typeof DollarSign; cls: string }> = {
  finanzas: { label: 'Finanzas', Icon: DollarSign, cls: 'text-ok' },
  animo: { label: 'Ánimo', Icon: Activity, cls: 'text-brand-soft-foreground' },
  sueno: { label: 'Sueño', Icon: Moon, cls: 'text-brand-soft-foreground' },
  salud: { label: 'Salud', Icon: Heart, cls: 'text-bad' },
  evento: { label: 'Eventos', Icon: Radar, cls: 'text-warn' },
  persona: { label: 'Gente', Icon: Activity, cls: 'text-foreground' },
  objetivo: { label: 'Objetivos', Icon: Activity, cls: 'text-foreground' },
  recordatorio: { label: 'Recordatorios', Icon: Activity, cls: 'text-foreground' },
}
const TONE_DOT: Record<TimelineTone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', neutral: 'bg-muted-foreground/50' }
const CAT_LABEL: Record<string, string> = { energy: 'Energía', mood: 'Ánimo', stress: 'Estrés', focus: 'Enfoque', motivation: 'Motivación', confidence: 'Confianza' }

export default function LineaPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={3} />
  return <LineaContent />
}

function LineaContent() {
  const { selfMetrics, sleepRecords, healthMetrics } = useSelfStore()
  const { financialMovements } = useFinanceStore()
  const [events, setEvents] = useState<{ id: string; title: string; eventDate: string; impact: string }[]>([])
  const [off, setOff] = useState<Set<TimelineSource>>(new Set())

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const r = await fetch('/api/watched-events', { cache: 'no-store' })
        if (!r.ok) return
        const j = (await r.json()) as { events?: { id: string; title: string; eventDate: string; impact: string }[] }
        if (alive) setEvents(j.events ?? [])
      } catch { /* sin eventos */ }
    })()
    return () => { alive = false }
  }, [])

  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = []
    for (const m of financialMovements) {
      const inflow = m.type === 'income'
      out.push({ id: `f_${m.id}`, date: m.date, source: 'finanzas', title: `${inflow ? '+' : '−'} S/ ${Math.round(m.amountPEN).toLocaleString('es')}`, detail: m.description || undefined, tone: inflow ? 'ok' : 'bad' })
    }
    for (const s of selfMetrics) {
      const v = s.value
      const tone: TimelineTone = s.category === 'stress' ? (v >= 7 ? 'bad' : v >= 4 ? 'warn' : 'ok') : (v >= 7 ? 'ok' : v >= 4 ? 'warn' : 'bad')
      out.push({ id: `sm_${s.id}`, date: s.timestamp, source: 'animo', title: `${CAT_LABEL[s.category] ?? s.category} ${v}/10`, detail: s.note || undefined, tone })
    }
    for (const s of sleepRecords) {
      const tone: TimelineTone = s.duration >= 7 ? 'ok' : s.duration >= 5 ? 'warn' : 'bad'
      out.push({ id: `sl_${s.id}`, date: s.date, source: 'sueno', title: `Dormiste ${s.duration}h`, detail: `calidad ${s.quality}/10`, body: s.dreams || undefined, tone })
    }
    for (const h of healthMetrics) {
      out.push({ id: `h_${h.id}`, date: h.timestamp, source: 'salud', title: `${getHealthMetricLabel(h.type)}: ${h.value} ${h.unit}`, body: h.note || undefined, tone: 'neutral' })
    }
    for (const e of events) {
      out.push({ id: `e_${e.id}`, date: e.eventDate, source: 'evento', title: e.title, detail: e.impact || undefined, tone: 'warn' })
    }
    return out
  }, [financialMovements, selfMetrics, sleepRecords, healthMetrics, events])

  const timeline = useMemo(
    () => buildUnifiedTimeline(items, { todayKey: todayLimaKey(), only: allExcept(off), maxDays: MAX_DAYS }),
    [items, off],
  )

  function toggle(s: TimelineSource) {
    setOff((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <GitCommitVertical size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Tu línea</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
          Tu vida en una sola línea: finanzas, ánimo, sueño, salud y eventos, día por día.
          Para <span className="text-foreground/80">verte</span> — cruza lo que pasó junto.
        </p>
      </div>

      {/* AF·F3 — cosas que no te cuadran (anomalías en tu propia data). */}
      <AnomaliesCard />

      {/* Filtro por fuente */}
      {timeline.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {timeline.sources.map((s) => {
            const on = !off.has(s)
            const { label, Icon } = SRC[s]
            return (
              <button key={s} type="button" onClick={() => toggle(s)}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  on ? 'border-brand/40 bg-brand-soft text-foreground' : 'border-border text-muted-foreground/60')}>
                <Icon size={11} strokeWidth={1.75} /> {label}
              </button>
            )
          })}
        </div>
      )}

      {timeline.total === 0 ? (
        <EmptyState icon={GitCommitVertical} size="sm" title="Todavía no hay nada en tu línea." hint="Registra finanzas, ánimo, sueño o eventos y aquí se cruzan solos." />
      ) : (
        <div className="space-y-5">
          {timeline.days.map((day) => (
            <div key={day.dayKey}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-medium">{day.label}</span>
                <span className="text-[10px] text-muted-foreground/50 font-mono">{day.dayKey}</span>
                <span className="text-[10px] text-muted-foreground/40 ml-auto">{day.items.length}</span>
              </div>
              <Card className="shadow-none">
                <CardContent className="p-0">
                  <ul className="divide-y divide-border/40">
                    {day.items.map((it) => {
                      const { Icon, cls } = SRC[it.source]
                      return (
                        <li key={it.id} className="flex items-start gap-3 px-4 py-2.5">
                          <span className={cn('mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0', TONE_DOT[it.tone ?? 'neutral'])} aria-hidden="true" />
                          <Icon size={13} strokeWidth={1.75} className={cn('mt-0.5 flex-shrink-0', cls)} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] text-foreground">{it.title}</div>
                            {it.detail && <div className="text-[11px] text-muted-foreground truncate">{it.detail}</div>}
                            {it.body && <div className="mt-0.5 text-[12px] text-foreground/75 italic leading-snug">«{it.body}»</div>}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}

/** Todas las fuentes MENOS las apagadas → para el `only` del motor (undefined = todas). */
function allExcept(off: Set<TimelineSource>): TimelineSource[] | undefined {
  if (off.size === 0) return undefined
  const ALL: TimelineSource[] = ['finanzas', 'animo', 'sueno', 'salud', 'evento', 'persona', 'objetivo', 'recordatorio']
  return ALL.filter((s) => !off.has(s))
}
