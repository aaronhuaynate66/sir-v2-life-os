'use client'
// SIR V2 — Página visual del motor "¿qué pasó el día X?". Elegís una fecha y SIR
// cruza TODO lo de ese día (interacciones, capturas, deals, pasos OKR, salud,
// score relacional, luna). Reusa GET /api/day. Complementa el chat.

import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Loader2, ChevronLeft, ChevronRight, Moon } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { todayLimaKey } from '@/lib/dates/limaDay'
import type { DaySlices } from '@/lib/day/dayContext'

function shift(date: string, d: number): string {
  const [y, m, dd] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, dd)); dt.setUTCDate(dt.getUTCDate() + d)
  return dt.toISOString().slice(0, 10)
}
const QUAL = ['', 'muy tensa', 'tensa', 'neutral', 'cálida', 'plena']

export default function DiaPage() {
  const [date, setDate] = useState(() => todayLimaKey())
  const [slices, setSlices] = useState<DaySlices | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/day?date=${d}`)
      if (res.ok) { const j = (await res.json()) as { slices: DaySlices }; setSlices(j.slices) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(date) }, [date, load])

  const empty = slices && !slices.interactions.length && !slices.observations.length &&
    !slices.deals.length && !slices.steps.length && !slices.health.length && !slices.scoreMoves.length

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
        <header className="flex items-center gap-2">
          <CalendarDays size={18} className="text-brand-soft-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">¿Qué pasó el día…?</h1>
        </header>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDate((d) => shift(d, -1))} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"><ChevronLeft size={16} /></button>
          <input type="date" value={date} max={todayLimaKey()} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground" />
          <button type="button" onClick={() => setDate((d) => (d < todayLimaKey() ? shift(d, 1) : d))} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"><ChevronRight size={16} /></button>
          {slices?.moonLabel && <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"><Moon size={13} /> {slices.moonLabel}</span>}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cruzando el día…</div>
        ) : !slices ? null : empty ? (
          <p className="text-sm text-muted-foreground">Sin registros ese día.</p>
        ) : (
          <div className="space-y-4">
            <Block title="Interacciones" rows={slices.interactions.map((i) => ({ k: i.person, v: `${i.quality != null ? (QUAL[i.quality] ?? i.quality) + (i.note ? ' · ' : '') : ''}${i.note ?? ''}` }))} />
            <Block title="Conversaciones / capturas" rows={slices.observations.map((o) => ({ k: o.person, v: o.summary }))} />
            <Block title="Oportunidades" rows={slices.deals.map((d) => ({ k: d.title, v: d.what }))} />
            <Block title="Objetivos (pasos)" rows={slices.steps.map((s) => ({ k: s.goal, v: s.step }))} />
            <Block title="Salud" rows={slices.health.map((h) => ({ k: h.label, v: h.value }))} />
            <Block title="Vínculos (score ese día)" rows={slices.scoreMoves.map((m) => ({ k: m.person, v: `${m.global}/100${m.delta != null && m.delta !== 0 ? ` (${m.delta > 0 ? '+' : ''}${m.delta})` : ''}` }))} />
          </div>
        )}
      </div>
    </AppShell>
  )
}

function Block({ title, rows }: { title: string; rows: { k: string; v: string }[] }) {
  if (rows.length === 0) return null
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">{title}</h2>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="text-[13px] text-foreground/90">
            <span className="font-medium">{r.k}</span>{r.v ? <span className="text-muted-foreground"> — {r.v}</span> : null}
          </div>
        ))}
      </div>
    </section>
  )
}
