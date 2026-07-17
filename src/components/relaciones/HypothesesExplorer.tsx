'use client'

// SIR V2 — HypothesesExplorer (19·M2): explorar hipótesis sobre algo que te
// preocupa de una persona. Cerrado por default (sensible). Devuelve hipótesis
// que COMPITEN — para entender, protegerse y decidir mejor, NUNCA para diagnosticar
// o etiquetar. Guardrails cosidos al prompt del server.

import { useState } from 'react'
import { Lightbulb, Loader2, ChevronDown, ShieldAlert, LifeBuoy } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { HypothesesResult, HypothesisKind } from '@/lib/profiling/hypothesesPrompt'

const KIND_LABEL: Record<HypothesisKind, string> = { contextual: 'Contextual', relacional: 'Relacional', clinico: 'Clínico-adyacente' }

export function HypothesesExplorer({ personId, personName }: { personId: string; personName: string }) {
  const [open, setOpen] = useState(false)
  const [concern, setConcern] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<HypothesesResult | null>(null)

  async function explore() {
    if (!concern.trim()) return
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await fetch('/api/profiling/hypotheses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, concern }),
      })
      const j = (await r.json()) as { result?: HypothesesResult; error?: string; detail?: string }
      if (!r.ok || !j.result) { setError(j.error ? `${j.error}${j.detail ? ` — ${j.detail}` : ''}` : 'No pude explorar.'); return }
      setResult(j.result)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2" aria-expanded={open}>
          <div className="flex items-center gap-2">
            <Lightbulb size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Explorar una preocupación</span>
          </div>
          <ChevronDown size={14} strokeWidth={1.75} className={cn('text-muted-foreground/60 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>

        {open && (
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-muted-foreground leading-snug">
              Cuéntame qué te preocupa de {personName}. SIR abre <span className="font-medium text-foreground/80">hipótesis que compiten</span> —para
              entender, protegerte y decidir mejor, no para diagnosticar ni etiquetar.
            </p>
            <textarea
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
              rows={3}
              placeholder="Ej: hace días está apagada y cortante y no sé si es algo mío, del trabajo, o algo más."
              className="w-full resize-y rounded-md border border-border bg-background p-2.5 text-sm leading-relaxed outline-none focus:border-foreground/30 min-h-[72px]"
            />
            <Button size="sm" variant="outline" onClick={() => void explore()} disabled={!concern.trim() || busy}>
              {busy ? <><Loader2 size={13} className="mr-1.5 animate-spin" />Explorando…</> : <><Lightbulb size={13} strokeWidth={1.75} className="mr-1.5" />Explorar hipótesis</>}
            </Button>
            {error && <p className="text-[12px] text-bad">{error}</p>}

            {result && (
              <div className="space-y-3 pt-1">
                {result.read && <p className="text-sm text-foreground/90 leading-relaxed">{result.read}</p>}

                <ul className="space-y-2.5">
                  {result.hypotheses.map((h, i) => (
                    <li key={i} className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium text-foreground">{h.label}</span>
                        <Badge variant="outline" className="text-[10px]">{KIND_LABEL[h.kind]}</Badge>
                      </div>
                      {h.supports && <p className="text-[12px] text-muted-foreground leading-snug"><span className="text-foreground/60">a favor:</span> {h.supports}</p>}
                      {h.against && <p className="text-[12px] text-muted-foreground leading-snug"><span className="text-foreground/60">en contra:</span> {h.against}</p>}
                      {h.action && <p className="text-[12px] text-brand-soft-foreground leading-snug mt-1">Movimiento para Aaron: {h.action}</p>}
                    </li>
                  ))}
                </ul>

                {result.protect && (
                  <div className="rounded-md border border-warn/40 bg-warn-soft p-3 flex items-start gap-2">
                    <ShieldAlert size={15} strokeWidth={1.75} className="text-warn mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.07em] text-warn font-medium mb-0.5">Cuidate</div>
                      <p className="text-[13px] text-foreground/90 leading-relaxed">{result.protect}</p>
                    </div>
                  </div>
                )}
                {result.escalate && (
                  <div className="rounded-md border border-bad/40 bg-bad-soft p-3 flex items-start gap-2">
                    <LifeBuoy size={15} strokeWidth={1.75} className="text-bad mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.07em] text-bad font-medium mb-0.5">Esto excede a SIR</div>
                      <p className="text-[13px] text-foreground/90 leading-relaxed">{result.escalate}</p>
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground/70 leading-relaxed border-t border-border/50 pt-2">{result.watchout}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
