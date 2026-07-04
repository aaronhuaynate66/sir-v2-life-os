'use client'

// SIR V2 — /ensayo (16·M4): Sala de ensayo — caminos al objetivo.
//
// Aaron elige una persona + un objetivo; SIR le juega caminos plausibles,
// objeciones y acciones que mueven la aguja — como HIPÓTESIS para prepararse, no
// como predicción. Aplica a TODOS los contactos, pero el registro cambia por
// vínculo (afectivo → cuidado; profesional → estrategia con objetivos alineados).
// Llama a /api/influence/rehearse (Sonnet).

import { useMemo, useState } from 'react'
import { Drama, Loader2, Sparkles, ShieldAlert, Lightbulb, ArrowRight, MessageCircleQuestion } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { detectBiases } from '@/engines/bias'
import { InfluenceMapCard } from '@/components/influence/InfluenceMapCard'
import { cn } from '@/lib/utils'
import type { RehearseResult, Likelihood } from '@/lib/influence/rehearsePrompt'

const LIKELIHOOD: Record<Likelihood, { label: string; cls: string }> = {
  plausible: { label: 'plausible', cls: 'border-brand/40 text-brand' },
  optimista: { label: 'optimista', cls: 'border-warn/40 text-warn' },
  dificil: { label: 'difícil', cls: 'border-border text-muted-foreground' },
}

export default function EnsayoPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={2} />
  return <EnsayoContent />
}

function EnsayoContent() {
  const people = useRelationshipStore((s) => s.people)
  const sorted = useMemo(
    () => [...people].sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0) || a.name.localeCompare(b.name)),
    [people],
  )

  const [personId, setPersonId] = useState('')
  const [objective, setObjective] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RehearseResult | null>(null)
  const [forName, setForName] = useState('')
  const [hadContext, setHadContext] = useState(true)

  // 14·M1 — sesgos en cómo describís el objetivo (client-side, puro). El más
  // típico acá: ilusionarte con la reacción del otro (wishful thinking).
  const biasHits = useMemo(() => detectBiases(objective).hits, [objective])

  async function run() {
    if (!personId || !objective.trim()) return
    setBusy(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/influence/rehearse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, objective }),
      })
      const j = (await res.json()) as { result?: RehearseResult; person?: { name: string; hadContext: boolean }; error?: string; detail?: string }
      if (!res.ok || !j.result) { setError(j.error ? `${j.error}${j.detail ? ` — ${j.detail}` : ''}` : 'No pude armar el ensayo.'); return }
      setResult(j.result); setForName(j.person?.name ?? ''); setHadContext(j.person?.hadContext ?? true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Drama size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Sala de ensayo</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
          Elegí a quién y qué querés lograr. SIR te juega los <span className="text-foreground/80">caminos posibles,
          las objeciones y qué mueve la aguja</span> — para que ENSAYES, no para adivinar. La gente real sorprende.
        </p>
      </div>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">Con quién</label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Elegí una persona…" /></SelectTrigger>
              <SelectContent>
                {sorted.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.title ? ` · ${p.title}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="obj" className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">Qué querés lograr</label>
            <textarea
              id="obj"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="Ej: Que me dé un aumento este trimestre. / Reconectar después de meses sin hablar. / Resolver un roce que quedó pendiente."
              className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-foreground/30 min-h-[80px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void run()} disabled={!personId || !objective.trim() || busy}>
              {busy ? <><Loader2 size={14} className="mr-1.5 animate-spin" />Ensayando…</> : <><Sparkles size={14} strokeWidth={1.75} className="mr-1.5" />Ensayar</>}
            </Button>
          </div>
          {biasHits.length > 0 && (
            <div className="rounded-md border border-warn/30 bg-warn-soft/40 p-2.5 space-y-1">
              {biasHits.map((h) => (
                <p key={h.bias} className="text-[11px] text-muted-foreground leading-snug">
                  <span className="text-warn font-medium">{h.label}:</span> {h.question}
                </p>
              ))}
            </div>
          )}
          {error && <div className="rounded-md border border-bad/30 bg-bad-soft p-2.5 text-[12px] text-bad leading-relaxed">{error}</div>}
        </CardContent>
      </Card>

      {/* 16·M2 — quién más pesa alrededor de esta persona (grafo, client-side). */}
      {personId && <InfluenceMapCard targetId={personId} />}

      {result && <RehearseView result={result} forName={forName} hadContext={hadContext} />}
    </AppShell>
  )
}

function RehearseView({ result, forName, hadContext }: { result: RehearseResult; forName: string; hadContext: boolean }) {
  return (
    <div className="space-y-4">
      {result.ethicalNote && (
        <Card className="shadow-none border-warn/40">
          <CardContent className="p-4 sm:p-5 bg-warn-soft">
            <div className="flex items-start gap-3">
              <ShieldAlert size={20} strokeWidth={1.75} className="text-warn mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-warn">Un alto acá</div>
                <p className="text-sm text-foreground/90 leading-relaxed mt-1">{result.ethicalNote}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {result.read && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-2">La lectura{forName ? ` · ${forName}` : ''}</div>
            {!hadContext && <p className="text-[11px] text-muted-foreground/80 mb-2">SIR tenía poco registro de esta persona — el ensayo es más genérico. Cuanto más le cuentes, más aterrizado.</p>}
            <p className="text-sm text-foreground/90 leading-relaxed">{result.read}</p>
          </CardContent>
        </Card>
      )}

      {result.scenarios.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-3">Caminos posibles</div>
            <ul className="space-y-3">
              {result.scenarios.map((s, i) => (
                <li key={i} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">{s.title || `Camino ${i + 1}`}</span>
                    <Badge variant="outline" className={cn('text-[10px] capitalize', LIKELIHOOD[s.likelihood].cls)}>{LIKELIHOOD[s.likelihood].label}</Badge>
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{s.path}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {result.objections.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-3">Objeciones que podés encontrar</div>
            <ul className="space-y-3">
              {result.objections.map((o, i) => (
                <li key={i} className="flex items-start gap-3">
                  <MessageCircleQuestion size={15} strokeWidth={1.75} className="text-warn mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-sm text-foreground">&ldquo;{o.objection}&rdquo;</div>
                    <p className="text-[13px] text-muted-foreground leading-relaxed mt-0.5">
                      <span className="text-text-tertiary text-[11px] uppercase tracking-[0.07em] mr-1.5">respondé</span>{o.response}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {result.actions.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-3">Qué mueve la aguja</div>
            <ul className="space-y-1.5">
              {result.actions.map((a, i) => (
                <li key={i} className="text-sm text-foreground/90 flex items-start gap-2">
                  <ArrowRight size={15} strokeWidth={1.75} className="text-brand mt-0.5 flex-shrink-0" aria-hidden="true" />
                  {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {result.opener && (
        <Card className="shadow-none border-brand/30">
          <CardContent className="p-4 sm:p-5 bg-brand-soft">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={14} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
              <span className="text-[11px] uppercase tracking-[0.07em] text-brand-soft-foreground font-sans">Una línea para arrancar</span>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed italic">&ldquo;{result.opener}&rdquo;</p>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground/80 leading-relaxed px-1">
        {result.watchout || 'Esto es un ensayo, no una predicción — la gente real sorprende. Usalo para prepararte, no para decidir por la profecía.'}
      </p>
    </div>
  )
}
