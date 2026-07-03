'use client'
// SIR V2 — /decidir: evaluador de decisiones (A4). Aaron describe una decisión y
// SIR la puntúa en las 7 dimensiones (docs/01) con el evaluador puro
// (engines/decision) + LLM. Consume POST /api/decision.

import { useState } from 'react'
import { Scale, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DIMENSION_LABEL, type DecisionAssessment } from '@/engines/decision'
import { cn } from '@/lib/utils'

const VERDICT: Record<DecisionAssessment['verdict'], { label: string; cls: string }> = {
  go: { label: 'Avanzá', cls: 'border-ok/30 bg-ok-soft text-ok' },
  caution: { label: 'Con cuidado', cls: 'border-warn/30 bg-warn-soft text-warn' },
  hold: { label: 'Frená', cls: 'border-bad/30 bg-bad-soft text-bad' },
}

function ScoreBar({ score }: { score: number }) {
  // -2..+2 → posición y color. Centro = 0.
  const pct = ((score + 2) / 4) * 100
  const tone = score > 0 ? 'bg-ok' : score < 0 ? 'bg-bad' : 'bg-muted-foreground/40'
  return (
    <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
      <div className={cn('absolute top-0 h-full rounded-full', tone)}
        style={score >= 0 ? { left: '50%', width: `${pct - 50}%` } : { right: '50%', width: `${50 - pct}%` }} />
    </div>
  )
}

export default function DecidirPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<DecisionAssessment | null>(null)

  async function evaluate() {
    if (busy || (!title.trim() && !description.trim())) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error ?? 'No pude evaluar'); return }
      setResult(j.assessment as DecisionAssessment)
    } catch { setErr('No pude evaluar') } finally { setBusy(false) }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Scale size={28} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Decidir</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Contame qué estás por decidir. SIR lo mira en 7 dimensiones — con la paz primero y sin ignorar si es reversible.</p>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="La decisión en una línea (ej: aceptar el proyecto X)" />
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Contexto: qué está en juego, qué te tira para cada lado…"
            rows={4}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void evaluate() }}
          />
          <div className="flex justify-end">
            <Button onClick={() => void evaluate()} disabled={busy || (!title.trim() && !description.trim())}>
              {busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Scale size={15} className="mr-2" />} Evaluar
            </Button>
          </div>
          {err && <p className="text-[11px] text-bad">{err}</p>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-medium text-foreground">{result.title}</div>
              <Badge variant="outline" className={cn('text-xs', VERDICT[result.verdict].cls)}>
                {result.verdict === 'go' ? <TrendingUp size={12} className="mr-1" /> : result.verdict === 'hold' ? <TrendingDown size={12} className="mr-1" /> : <Minus size={12} className="mr-1" />}
                {VERDICT[result.verdict].label}
              </Badge>
            </div>

            <ul className="space-y-3">
              {result.dimensions.map((d) => (
                <li key={d.dimension} className={cn('space-y-1', !d.evaluated && 'opacity-40')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground/90">{DIMENSION_LABEL[d.dimension]}</span>
                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{d.evaluated ? (d.score > 0 ? `+${d.score}` : d.score) : '—'}</span>
                  </div>
                  <ScoreBar score={d.score} />
                  {d.note && <p className="text-[11px] text-muted-foreground leading-snug">{d.note}</p>}
                </li>
              ))}
            </ul>

            {result.topRisk && (
              <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-3">
                Mayor riesgo: <span className="text-foreground/80">{DIMENSION_LABEL[result.topRisk.dimension]}</span>
                {result.topRisk.note ? ` — ${result.topRisk.note}` : ''}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}
