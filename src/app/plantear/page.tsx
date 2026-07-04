'use client'

// SIR V2 — /plantear (16·M1): "cómo plantearle X a [persona]".
//
// Aaron elige una persona y describe qué le quiere plantear; SIR encuadra SU
// VERDAD en el lenguaje de lo que esa persona valora (framing ético, con
// guardrail anti-manipulación). Caso motor: pedir el aumento a los ejecutivos
// de HNG. Llama a /api/influence/frame (Sonnet).

import { useMemo, useState } from 'react'
import { MessagesSquare, Loader2, Sparkles, ShieldAlert, ArrowRight, Lightbulb } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import type { FrameResult } from '@/lib/influence/framePrompt'

export default function PlantearPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={2} />
  return <PlantearContent />
}

function PlantearContent() {
  const people = useRelationshipStore((s) => s.people)
  const sorted = useMemo(
    () => [...people].sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0) || a.name.localeCompare(b.name)),
    [people],
  )

  const [personId, setPersonId] = useState('')
  const [objective, setObjective] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FrameResult | null>(null)
  const [forName, setForName] = useState('')
  const [hadContext, setHadContext] = useState(true)

  async function run() {
    if (!personId || !objective.trim()) return
    setBusy(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/influence/frame', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, objective }),
      })
      const j = (await res.json()) as { result?: FrameResult; person?: { name: string; hadContext: boolean }; error?: string; detail?: string }
      if (!res.ok || !j.result) { setError(j.error ? `${j.error}${j.detail ? ` — ${j.detail}` : ''}` : 'No pude preparar el planteo.'); return }
      setResult(j.result); setForName(j.person?.name ?? ''); setHadContext(j.person?.hadContext ?? true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <MessagesSquare size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Cómo plantear algo</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
          Elegí a quién y qué le querés plantear. SIR encuadra <span className="text-foreground/80">tu verdad en el
          lenguaje de lo que esa persona valora</span> — para que se entienda, no para manipular. (Ideal para el
          pedido de aumento.)
        </p>
      </div>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">A quién</label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Elegí una persona…" /></SelectTrigger>
              <SelectContent>
                {sorted.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.title ? ` · ${p.title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="obj" className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">Qué le querés plantear</label>
            <textarea
              id="obj"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="Ej: Pedirle un aumento de sueldo, apoyándome en los resultados del año."
              className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-foreground/30 min-h-[80px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void run()} disabled={!personId || !objective.trim() || busy}>
              {busy ? <><Loader2 size={14} className="mr-1.5 animate-spin" />Preparando…</> : <><Sparkles size={14} strokeWidth={1.75} className="mr-1.5" />Preparar el planteo</>}
            </Button>
          </div>
          {error && (
            <div className="rounded-md border border-bad/30 bg-bad-soft p-2.5 text-[12px] text-bad leading-relaxed">{error}</div>
          )}
        </CardContent>
      </Card>

      {result && <FrameView result={result} forName={forName} hadContext={hadContext} />}
    </AppShell>
  )
}

function FrameView({ result, forName, hadContext }: { result: FrameResult; forName: string; hadContext: boolean }) {
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

      {result.values.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-2">
              Qué mueve a {forName || 'esta persona'}
            </div>
            {!hadContext && (
              <p className="text-[11px] text-muted-foreground/80 mb-2">SIR tenía poco registro de esta persona — esto es inferido de su rol, tomalo con pinzas.</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {result.values.map((v, i) => (
                <Badge key={i} variant="outline" className="text-[11px] font-normal">{v}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {result.frame && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-2">El ángulo</div>
            <p className="text-sm text-foreground/90 leading-relaxed">{result.frame}</p>
            {result.leadWith && (
              <div className="mt-3 flex items-start gap-2 text-sm">
                <ArrowRight size={15} strokeWidth={1.75} className="text-brand mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span className="text-foreground/90"><span className="text-text-tertiary text-[11px] uppercase tracking-[0.07em] mr-2">Abrí con</span>{result.leadWith}</span>
              </div>
            )}
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

      {result.avoid.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-2">Qué evitar</div>
            <ul className="space-y-1">
              {result.avoid.map((a, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 rounded-full bg-bad/70 flex-shrink-0" aria-hidden="true" />
                  {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground/80 leading-relaxed px-1">
        Es <span className="font-medium text-foreground/70">tu verdad en el lenguaje del otro</span>, no un libreto para
        engañar. Decilo solo si lo podés sostener — si tenés que mentir para que funcione, no es el camino.
      </p>
    </div>
  )
}
