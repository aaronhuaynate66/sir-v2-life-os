'use client'
// SIR V2 — /decidir: evaluador de decisiones (A4). Aaron describe una decisión y
// SIR la puntúa en las 7 dimensiones (docs/01) con el evaluador puro
// (engines/decision) + LLM. Consume POST /api/decision.

import { useMemo, useState } from 'react'
import { Scale, Loader2, TrendingUp, TrendingDown, Minus, Brain } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DIMENSION_LABEL, type DecisionAssessment } from '@/engines/decision'
import { calibrateDecision } from '@/engines/decision/calibrate'
import { anchorsToCheck } from '@/lib/decision/valuesCheck'
import { useSelfStore } from '@/stores/useSelfStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { detectBiases } from '@/engines/bias'
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
    <div aria-hidden="true" className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
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

  // 14·M1 — detector de sesgos en vivo (client-side, puro, no-bloqueante).
  // Marca cómo describís la decisión: no cambia el veredicto, solo enciende una luz.
  const biasHits = useMemo(() => detectBiases(`${title} ${description}`).hits, [title, description])

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
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="La decisión, en una línea" placeholder="La decisión en una línea (ej: aceptar el proyecto X)" />
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            aria-label="Contexto de la decisión"
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

      {/* 14·M1 — sesgos detectados en cómo lo describís. No bloquea nada; es para
          activar tu sistema 2 antes de evaluar. */}
      {biasHits.length > 0 && (
        <Card className="mb-4 border-warn/30">
          <CardContent className="p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Brain size={14} strokeWidth={1.75} className="text-warn" aria-hidden="true" />
              <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">Ojo con cómo lo estás pensando</span>
            </div>
            <ul className="space-y-2">
              {biasHits.map((h) => (
                <li key={h.bias} className="text-[13px]">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-foreground font-medium">{h.label}</span>
                    {h.evidence.map((e, i) => (
                      <span key={i} className="text-[10px] font-mono rounded bg-muted/50 border border-border px-1.5 py-0.5 text-muted-foreground">&ldquo;{e}&rdquo;</span>
                    ))}
                  </div>
                  <p className="text-muted-foreground leading-snug mt-0.5">{h.question}</p>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">Es una luz, no un veredicto — a veces la urgencia es real. Solo te lo dejo a la vista antes de decidir.</p>
          </CardContent>
        </Card>
      )}

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

            {/* 14·M3 + 14·M4 — calibrador de esfuerzo + modo maximizar/satisficer. */}
            <DecisionCalibrationBlock result={result} />
            {/* 14·M6 — coherencia con valores/identidad (si la decisión los tensiona). */}
            <ValuesCoherenceBlock result={result} />
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}

const DOOR_LABEL = { two_way: 'Puerta de dos vías', one_way: 'Puerta de una vía', unclear: 'Reversibilidad poco clara' } as const

function DecisionCalibrationBlock({ result }: { result: DecisionAssessment }) {
  const cal = useMemo(() => calibrateDecision(result), [result])
  const oneWay = cal.doorType === 'one_way'
  return (
    <div className="border-t border-border/50 pt-3 space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <Scale size={12} className={oneWay ? 'text-warn' : 'text-ok'} aria-hidden="true" />
          <span className={cn('text-xs font-medium', oneWay ? 'text-warn' : 'text-ok')}>{DOOR_LABEL[cal.doorType]}</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{cal.effortGuidance}</p>
      </div>
      <div>
        <span className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary">
          Modo sugerido: {cal.mode === 'maximize' ? 'maximizar' : 'satisficer'}
        </span>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{cal.modeGuidance}</p>
      </div>
    </div>
  )
}

function ValuesCoherenceBlock({ result }: { result: DecisionAssessment }) {
  const { identityProfile } = useSelfStore()
  const { goals } = useGoalStore()
  const cal = useMemo(() => calibrateDecision(result), [result])
  const anchors = useMemo(
    () => anchorsToCheck({
      yearAnchor: goals.find((g) => g.isAnchor)?.title ?? null,
      identityBio: identityProfile?.bio,
    }),
    [goals, identityProfile],
  )
  if (!cal.valuesTension || anchors.length === 0) return null
  return (
    <div className="border-t border-border/50 pt-3">
      <p className="text-[11px] text-warn font-medium">Esto tensiona tus valores.</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
        No hay respuesta limpia (los valores compiten), pero antes de cerrar, mirala contra tus anclas:
      </p>
      <ul className="mt-2 space-y-1">
        {anchors.map((a) => (
          <li key={a.label} className="text-[11px] leading-relaxed">
            <span className="text-text-tertiary uppercase tracking-[0.05em] text-[9px]">{a.label}: </span>
            <span className="text-foreground/85">{a.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
