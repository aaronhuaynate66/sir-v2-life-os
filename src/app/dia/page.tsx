'use client'
// SIR V2 — Página visual del motor "¿qué pasó el día X?". Elegís una fecha y SIR
// cruza TODO lo de ese día (interacciones, capturas, deals, pasos OKR, salud,
// score relacional, luna). Reusa GET /api/day. Complementa el chat.
// Cabecera de ÁNIMO del día (dayMood, determinístico) para darle peso emocional.

import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Loader2, ChevronLeft, ChevronRight, Moon, AlertTriangle, Heart, Minus, Sparkles } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { todayLimaKey } from '@/lib/dates/limaDay'
import { dayMood, type DaySlices, type DayTone } from '@/lib/day/dayContext'

function shift(date: string, d: number): string {
  const [y, m, dd] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, dd)); dt.setUTCDate(dt.getUTCDate() + d)
  return dt.toISOString().slice(0, 10)
}
const QUAL = ['', 'muy tensa', 'tensa', 'neutral', 'cálida', 'plena']

const MOOD_STYLE: Record<DayTone, { box: string; icon: typeof AlertTriangle; label: string }> = {
  tense: { box: 'border-warn/40 bg-warn-soft/40 text-warn-foreground', icon: AlertTriangle, label: 'Día tenso' },
  warm: { box: 'border-ok/40 bg-ok-soft/40 text-ok', icon: Heart, label: 'Buen día' },
  calm: { box: 'border-border bg-card text-foreground/80', icon: Minus, label: 'Día tranquilo' },
  empty: { box: 'border-border bg-card text-muted-foreground', icon: Minus, label: 'Sin registros' },
}

function fmtLong(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function DiaPage() {
  const [date, setDate] = useState(() => todayLimaKey())
  const [slices, setSlices] = useState<DaySlices | null>(null)
  const [loading, setLoading] = useState(false)
  const [narrative, setNarrative] = useState<string | null>(null)
  const [narrLoading, setNarrLoading] = useState(false)
  async function tellStory() {
    setNarrLoading(true); setNarrative(null)
    try {
      const res = await fetch('/api/sir/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: `¿Qué pasó el ${date}? Contámelo breve, como un resumen del día.`, history: [], skipInlineGaps: true }),
      })
      const j = await res.json()
      setNarrative(typeof j.answer === 'string' ? j.answer : 'No pude generar el relato.')
    } catch { setNarrative('Error al generar el relato.') } finally { setNarrLoading(false) }
  }

  const load = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/day?date=${d}`)
      if (res.ok) { const j = (await res.json()) as { slices: DaySlices }; setSlices(j.slices) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(date); setNarrative(null) }, [date, load])

  const mood = slices ? dayMood(slices) : null
  const today = todayLimaKey()
  const quick: [string, string][] = [['Hoy', today], ['Ayer', shift(today, -1)], ['Anteayer', shift(today, -2)]]

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
        <header className="flex items-center gap-2">
          <CalendarDays size={18} className="text-brand-soft-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">¿Qué pasó el día…?</h1>
        </header>

        <div className="flex items-center gap-2 flex-wrap">
          {quick.map(([label, d]) => (
            <button key={label} type="button" onClick={() => setDate(d)}
              className={`rounded-full border px-3 py-1 text-xs ${date === d ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setDate((d) => shift(d, -1))} aria-label="Día anterior" className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"><ChevronLeft size={16} /></button>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground" />
            <button type="button" onClick={() => setDate((d) => (d < today ? shift(d, 1) : d))} aria-label="Día siguiente" className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"><ChevronRight size={16} /></button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cruzando el día…</div>
        ) : !slices || !mood ? null : (
          <>
            {(() => {
              const st = MOOD_STYLE[mood.tone]; const Icon = st.icon
              return (
                <div className={`rounded-lg border p-4 ${st.box}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={15} aria-hidden="true" />
                    <span className="text-[11px] uppercase tracking-[0.07em] font-medium">{st.label}</span>
                    <span className="ml-auto text-xs opacity-70 capitalize">{fmtLong(date)}</span>
                    {slices.weather && <span className="text-xs opacity-70">{slices.weather}</span>}
                    {slices.moonLabel && <span className="inline-flex items-center gap-1 text-xs opacity-70"><Moon size={12} /> {slices.moonLabel}</span>}
                  </div>
                  <p className="text-sm leading-relaxed">{mood.headline}</p>
                </div>
              )
            })()}

            {mood.tone !== 'empty' && (
              <div>
                {narrative ? (
                  <div className="rounded-lg border border-border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{narrative}</div>
                ) : (
                  <button type="button" onClick={() => void tellStory()} disabled={narrLoading}
                    className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand-soft/30 px-3 py-1.5 text-xs text-brand-soft-foreground hover:bg-brand/15 disabled:opacity-50">
                    {narrLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {narrLoading ? 'SIR está recordando…' : 'Que SIR lo cuente'}
                  </button>
                )}
              </div>
            )}

            {mood.tone === 'empty' ? null : (
              <div className="space-y-4">
                {slices.interactions.length > 0 && (
                  <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">Interacciones</h2>
                    <div className="space-y-1.5">
                      {slices.interactions.map((i, idx) => {
                        const tense = i.quality != null && i.quality <= 2
                        const warm = i.quality != null && i.quality >= 4
                        return (
                          <div key={idx} className={`text-[13px] border-l-2 pl-2 ${tense ? 'border-l-warn' : warm ? 'border-l-ok' : 'border-l-border'}`}>
                            <span className="font-medium text-foreground">{i.person}</span>
                            <span className="text-muted-foreground">{i.quality != null ? ` · ${QUAL[i.quality] ?? i.quality}` : ''}{i.note ? ` — ${i.note}` : ''}</span>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}
                <Block title="Conversaciones / capturas" rows={slices.observations.map((o) => ({ k: o.person, v: o.summary }))} />
                <Block title="Oportunidades" rows={slices.deals.map((d) => ({ k: d.title, v: d.what }))} />
                <Block title="Momentos y decisiones" rows={slices.moments.map((mo) => ({ k: mo.kind === 'follow' ? `Seguimiento · ${mo.person}` : mo.person, v: mo.title }))} />
                <Block title="Objetivos (pasos)" rows={slices.steps.map((s) => ({ k: s.goal, v: s.step }))} />
                <Block title="Salud" rows={slices.health.map((h) => ({ k: h.label, v: h.value }))} />
                <Block title="Medicación" rows={slices.meds.map((m) => ({ k: `${m.time} · ${m.name}${m.quantity > 1 ? ` x${m.quantity}` : ''}`, v: '' }))} />
                <Block title="Finanzas" rows={slices.finances.map((fn) => ({ k: `${fn.type} ${fn.amount} ${fn.currency}`, v: fn.description }))} />
                <Block title="Señales activas" rows={slices.signals.map((sg) => ({ k: sg.urgency, v: sg.content }))} />
                <Block title="Vínculos (score ese día)" rows={slices.scoreMoves.map((m) => ({ k: m.person, v: `${m.global}/100${m.delta != null && m.delta !== 0 ? ` (${m.delta > 0 ? '+' : ''}${m.delta})` : ''}` }))} />
              </div>
            )}
          </>
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
