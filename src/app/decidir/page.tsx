'use client'
// SIR V2 — /decidir: evaluador de decisiones (A4). Aaron describe una decisión y
// SIR la puntúa en las 7 dimensiones (docs/01) con el evaluador puro
// (engines/decision) + LLM. Consume POST /api/decision.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Scale, Loader2, TrendingUp, TrendingDown, Minus, Brain, Sparkles, Skull, AlertTriangle, Eye, ShieldCheck } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DIMENSION_LABEL, type DecisionAssessment } from '@/engines/decision'
import { calibrateDecision } from '@/engines/decision/calibrate'
import { anchorsToCheck } from '@/lib/decision/valuesCheck'
import { findSimilarDecisions, type PastDecision } from '@/lib/decision/similar'
import { useSelfStore } from '@/stores/useSelfStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { detectBiases } from '@/engines/bias'
import type { Premortem, Likelihood } from '@/lib/decision/premortemPrompt'
import { cn } from '@/lib/utils'

const VERDICT: Record<DecisionAssessment['verdict'], { label: string; cls: string }> = {
  go: { label: 'Avanza', cls: 'border-ok/30 bg-ok-soft text-ok' },
  caution: { label: 'Con cuidado', cls: 'border-warn/30 bg-warn-soft text-warn' },
  hold: { label: 'Frena', cls: 'border-bad/30 bg-bad-soft text-bad' },
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
  // 14·M5 — decisiones pasadas (para el outside view).
  const [past, setPast] = useState<PastDecision[]>([])

  // 14·M1 — detector de sesgos en vivo (client-side, puro, no-bloqueante).
  // Marca cómo describís la decisión: no cambia el veredicto, solo enciende una luz.
  const biasHits = useMemo(() => detectBiases(`${title} ${description}`).hits, [title, description])

  const loadPast = useCallback(async () => {
    try {
      const r = await fetch('/api/decisions')
      if (r.ok) { const j = (await r.json()) as { decisions: PastDecision[] }; setPast(j.decisions ?? []) }
    } catch { /* best-effort */ }
  }, [])
  useEffect(() => { void loadPast() }, [loadPast])

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
      const assessment = j.assessment as DecisionAssessment
      setResult(assessment)
      // 14·M5 — persistir la decisión (dedupe por título) para el outside view futuro.
      void fetch('/api/decisions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: assessment.title, description,
          verdict: assessment.verdict, weighted: assessment.weighted,
          topRisk: assessment.topRisk ? DIMENSION_LABEL[assessment.topRisk.dimension] : null,
        }),
      }).then(() => loadPast()).catch(() => {})
    } catch { setErr('No pude evaluar') } finally { setBusy(false) }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Scale size={28} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Decidir</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Cuéntame qué estás por decidir. SIR lo mira en 7 dimensiones — con la paz primero y sin ignorar si es reversible.</p>
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

            {/* 14·M2 — premortem forzado en decisiones riesgosas, antes de la
                recomendación. Envuelve la calibración (M3/M4) + coherencia (M6). */}
            <PremortemSection result={result} description={description} />
            {/* 14·M2 — premortem estructurado: "salió mal en 6 meses, ¿por qué?"
                → modos de falla + señales tempranas + mitigaciones (Sonnet). */}
            <StructuredPremortem title={result.title} description={description} />
            {/* 14·M5 — decisiones pasadas parecidas + su resultado (outside view). */}
            <SimilarDecisionsBlock result={result} past={past} description={description} onOutcome={loadPast} />
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}

// 14·M2 — premortem forzado. En decisiones que lo ameritan (irreversibles o
// veredicto no-go), pide imaginar el fracaso ANTES de mostrar la recomendación
// completa. Activa Sistema 2. El premortem es TUYO (lo escribís vos); "Pensarlo
// con SIR" corre el premortem asistido (reusa /api/self/premortem, grounded en
// tu norte + objetivos + conflictos abiertos) para SEMBRAR el peor caso — no
// para reemplazar tu pensamiento.
function PremortemSection({ result, description }: { result: DecisionAssessment; description: string }) {
  const cal = useMemo(() => calibrateDecision(result), [result])
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)

  const runAiPremortem = useCallback(async () => {
    setAiLoading(true)
    setAiErr(null)
    try {
      const decision = [result.title, description].map((s) => s.trim()).filter(Boolean).join('. ')
      const res = await fetch('/api/self/premortem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      // El body puede NO ser JSON en 504/gateway → parseo con red de seguridad
      // para no filtrar el críptico "The string did not match the expected pattern".
      const raw = await res.text()
      let j: { premortem?: string; error?: string } = {}
      try { j = raw ? JSON.parse(raw) : {} } catch { /* no-JSON (timeout/gateway) */ }
      if (!res.ok || !j.premortem) {
        setAiErr(j.error ?? (res.status === 504 || res.status === 502
          ? 'Tardó demasiado y el servidor cortó. Reinténtalo.'
          : `No se pudo correr el pre-mortem (código ${res.status || '—'}).`))
        return
      }
      setAiText(j.premortem)
    } catch {
      setAiErr('No se pudo correr el pre-mortem. Revisa tu conexión.')
    } finally {
      setAiLoading(false)
    }
  }, [result.title, description])

  const aiBlock = (aiText || aiLoading || aiErr) ? (
    <div className="rounded-md border border-brand/25 bg-brand/5 p-2.5 space-y-1">
      <div className="flex items-center gap-1.5">
        <Sparkles size={11} className="text-brand" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.06em] text-brand-soft-foreground">Pre-mortem de SIR</span>
      </div>
      {aiLoading && <p className="text-[11px] text-muted-foreground">Pensando el peor caso…</p>}
      {aiErr && <p className="text-[11px] text-bad">{aiErr}</p>}
      {aiText && <p className="text-[11px] text-foreground/85 leading-relaxed whitespace-pre-wrap">{aiText}</p>}
    </div>
  ) : null

  const aiButton = !aiText ? (
    <Button size="sm" variant="ghost" disabled={aiLoading} onClick={() => void runAiPremortem()}>
      <Sparkles size={12} strokeWidth={2} className="mr-1.5" />
      {aiLoading ? 'Pensando…' : 'Pensarlo con SIR'}
    </Button>
  ) : null

  const guidance = (
    <>
      <DecisionCalibrationBlock result={result} />
      <ValuesCoherenceBlock result={result} />
      {done && text.trim() && (
        <div className="border-t border-border/50 pt-3">
          <span className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary">Tu premortem</span>
          <p className="text-[11px] text-foreground/85 leading-relaxed mt-1 whitespace-pre-wrap">{text.trim()}</p>
        </div>
      )}
    </>
  )

  if (!cal.premortemRecommended || done) return guidance

  return (
    <div className="border-t border-border/50 pt-3 space-y-2">
      <p className="text-xs font-medium text-warn">Antes de la recomendación: haz el premortem.</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Imagina que en 6 meses esto salió mal. ¿Qué pasó? (Es una decisión cara de revertir o dudosa — pensar el peor caso ahora vale más que después.)
      </p>
      {aiBlock}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Lo que salió mal fue…"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" disabled={text.trim().length < 3} onClick={() => setDone(true)}>
          Ver recomendación
        </Button>
        {aiButton}
      </div>
    </div>
  )
}

// 14·M2 — premortem ESTRUCTURADO. Complementa el premortem en prosa: en vez de
// un párrafo, asume que la decisión ya fracasó a 6 meses y devuelve MODOS DE
// FALLA (causa + probabilidad + señal temprana + mitigación). Consume
// /api/decision/premortem (Sonnet, cache diaria). Es anticipación, no predicción.
const LIKELIHOOD_META: Record<Likelihood, { label: string; cls: string }> = {
  alta: { label: 'Probable', cls: 'border-bad/30 bg-bad-soft text-bad' },
  media: { label: 'Posible', cls: 'border-warn/30 bg-warn-soft text-warn' },
  baja: { label: 'Menos probable', cls: 'border-border bg-muted text-muted-foreground' },
}

function StructuredPremortem({ title, description }: { title: string; description: string }) {
  const [data, setData] = useState<Premortem | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (loading) return
    setLoading(true); setErr(null)
    try {
      const res = await fetch('/api/decision/premortem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      })
      const raw = await res.text()
      let j: { premortem?: Premortem; error?: string } = {}
      try { j = raw ? JSON.parse(raw) : {} } catch { /* no-JSON (timeout/gateway) */ }
      if (!res.ok || !j.premortem) {
        setErr(j.error ?? (res.status === 504 || res.status === 502
          ? 'Tardó demasiado y el servidor cortó. Reinténtalo.'
          : 'No pude armar el premortem.'))
        return
      }
      setData(j.premortem)
    } catch { setErr('No pude armar el premortem.') } finally { setLoading(false) }
  }, [title, description, loading])

  return (
    <div className="border-t border-border/50 pt-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Skull size={14} strokeWidth={1.75} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">Premortem: imagina que salió mal</span>
        </div>
        {!data && (
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void run()}>
            {loading ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Skull size={12} className="mr-1.5" />}
            {loading ? 'Pensando el peor caso…' : 'Imaginar el fracaso'}
          </Button>
        )}
      </div>

      {err && <p className="text-[11px] text-bad">{err}</p>}

      {data && (
        <div className="space-y-3">
          <p className="text-[12px] text-foreground/85 leading-relaxed">{data.frame}</p>
          <ul className="space-y-2.5">
            {data.failureModes.map((m, i) => (
              <li key={i} className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle size={13} strokeWidth={1.9} className="text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                    <span className="text-[13px] text-foreground leading-snug">{m.cause}</span>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] shrink-0', LIKELIHOOD_META[m.likelihood].cls)}>
                    {LIKELIHOOD_META[m.likelihood].label}
                  </Badge>
                </div>
                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
                  <Eye size={12} strokeWidth={1.9} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
                  <span><span className="text-text-tertiary uppercase tracking-[0.05em] text-[9px]">Señal temprana · </span>{m.earlySignal}</span>
                </div>
                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
                  <ShieldCheck size={12} strokeWidth={1.9} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                  <span><span className="text-text-tertiary uppercase tracking-[0.05em] text-[9px]">Mitigación · </span>{m.mitigation}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground/70 leading-relaxed">Es una herramienta de anticipación, no una predicción — riesgos plausibles para que los tengas a la vista, no un pronóstico de lo que va a pasar.</p>
        </div>
      )}
    </div>
  )
}

const VERDICT_WORD = { go: 'avanzar', caution: 'con cuidado', hold: 'frenar' } as const

// 14·M5 — trae decisiones pasadas parecidas y, si guardaste cómo salieron, lo
// muestra (el outside view contra la planning fallacy). Permite backfillear el
// resultado inline (¿cómo salió?).
function SimilarDecisionsBlock({
  result, past, description, onOutcome,
}: { result: DecisionAssessment; past: PastDecision[]; description: string; onOutcome: () => void }) {
  const similar = useMemo(
    () => findSimilarDecisions(
      { title: result.title, description, topRisk: result.topRisk ? DIMENSION_LABEL[result.topRisk.dimension] : null },
      past,
    ),
    [result, past, description],
  )
  if (similar.length === 0) return null

  return (
    <div className="border-t border-border/50 pt-3 space-y-2">
      <span className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary">Algo parecido decidiste antes</span>
      <ul className="space-y-2.5">
        {similar.map((m) => (
          <SimilarRow key={m.decision.id} d={m.decision} onOutcome={onOutcome} />
        ))}
      </ul>
    </div>
  )
}

function SimilarRow({ d, onOutcome }: { d: PastDecision; onOutcome: () => void }) {
  const [editing, setEditing] = useState(false)
  const [outcome, setOutcome] = useState('')
  const [saving, setSaving] = useState(false)
  const when = d.createdAt.slice(0, 10)

  async function save() {
    if (saving || outcome.trim().length < 3) return
    setSaving(true)
    try {
      await fetch('/api/decisions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, outcome }),
      })
      setEditing(false); onOutcome()
    } finally { setSaving(false) }
  }

  return (
    <li className="text-[11px] leading-relaxed">
      <div>
        <span className="text-foreground/85">{d.title}</span>
        <span className="text-muted-foreground/60"> · {when} · elegiste {VERDICT_WORD[d.verdict]}</span>
      </div>
      {d.outcome ? (
        <p className="text-muted-foreground mt-0.5">Cómo salió: <span className="text-foreground/80">{d.outcome}</span></p>
      ) : editing ? (
        <div className="mt-1 flex gap-1.5">
          <input
            value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="¿Cómo salió?"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground"
          />
          <Button size="sm" variant="outline" disabled={saving || outcome.trim().length < 3} onClick={save}>Guardar</Button>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="mt-0.5 text-[10px] text-brand hover:underline">
          + anotar cómo salió
        </button>
      )}
    </li>
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
        No hay respuesta limpia (los valores compiten), pero antes de cerrar, mírala contra tus anclas:
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
