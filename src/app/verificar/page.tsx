'use client'

// SIR V2 — /verificar: detector de manipulación entrante (16·M3, defensa).
//
// Dos capas: (1) SCAN INSTANTÁNEO client-side — ingeniería social (Cialdini) +
// técnicas de propaganda con firma léxica. Instantáneo, gratis, y el texto NO sale
// del navegador. (2) ANÁLISIS PROFUNDO con IA (opt-in) — cubre las 23 técnicas del
// catálogo, incluidas las semánticas que el regex no ve; este modo SÍ manda el
// texto al modelo, y se avisa antes.

import { useState } from 'react'
import { ShieldAlert, ShieldCheck, ShieldQuestion, AlertTriangle, Sparkles, Loader2, Megaphone } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { detectManipulation, detectRhetoric, type ManipulationResult, type ManipulationRisk, type RhetoricResult } from '@/engines/manipulation'
import { CATEGORY_LABEL } from '@/engines/manipulation/techniques'
import type { DeepScanResult } from '@/lib/verificar/deepScan'

const RISK_UI: Record<ManipulationRisk, { label: string; tone: string; border: string; bg: string; Icon: typeof ShieldAlert }> = {
  high: { label: 'Riesgo alto', tone: 'text-bad', border: 'border-bad/40', bg: 'bg-bad-soft', Icon: ShieldAlert },
  medium: { label: 'Con señales', tone: 'text-warn', border: 'border-warn/40', bg: 'bg-warn-soft', Icon: AlertTriangle },
  low: { label: 'Señal suelta', tone: 'text-warn', border: 'border-border', bg: 'bg-muted/30', Icon: ShieldQuestion },
  none: { label: 'Sin señales', tone: 'text-ok', border: 'border-ok/40', bg: 'bg-ok-soft', Icon: ShieldCheck },
}

type DeepState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: DeepScanResult }
  | { kind: 'error'; message: string }

export default function VerificarPage() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<ManipulationResult | null>(null)
  const [rhetoric, setRhetoric] = useState<RhetoricResult | null>(null)
  const [deep, setDeep] = useState<DeepState>({ kind: 'idle' })

  function analyze() {
    if (!text.trim()) { setResult(null); setRhetoric(null); setDeep({ kind: 'idle' }); return }
    setResult(detectManipulation(text))
    setRhetoric(detectRhetoric(text))
    setDeep({ kind: 'idle' })
  }
  function clear() { setText(''); setResult(null); setRhetoric(null); setDeep({ kind: 'idle' }) }

  async function runDeep() {
    setDeep({ kind: 'loading' })
    try {
      const res = await fetch('/api/verificar/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = (await res.json().catch(() => null)) as { result?: DeepScanResult; error?: string } | null
      if (!res.ok || !data?.result) {
        setDeep({ kind: 'error', message: data?.error ?? 'No se pudo analizar. Reintentá.' })
        return
      }
      setDeep({ kind: 'done', result: data.result })
    } catch {
      setDeep({ kind: 'error', message: 'No se pudo analizar. Reintentá.' })
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <ShieldAlert size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Verificar mensaje</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
          Pegá un mensaje que te llegó (mail, chat, un pedido raro) y SIR marca las señales de
          manipulación — presión de ingeniería social y técnicas de propaganda. El scan instantáneo corre
          en tu navegador: el texto <span className="text-foreground/80">no se guarda ni se manda a ningún lado.</span>
        </p>
      </div>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5">
          <label htmlFor="msg" className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-2">
            El mensaje a revisar
          </label>
          <textarea
            id="msg"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="Ej: 'Soy del banco. Detectamos actividad sospechosa y tu cuenta será suspendida. Ingresá acá ahora mismo para verificar tus datos.'"
            className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-foreground/30 min-h-[140px]"
          />
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={analyze} disabled={!text.trim()}>
              <ShieldAlert size={14} strokeWidth={1.75} className="mr-1.5" />
              Analizar
            </Button>
            {text && (
              <button type="button" onClick={clear} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
                Limpiar
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <ResultView
          result={result}
          rhetoric={rhetoric}
          deep={deep}
          onDeep={runDeep}
        />
      )}
    </AppShell>
  )
}

function ResultView({
  result,
  rhetoric,
  deep,
  onDeep,
}: {
  result: ManipulationResult
  rhetoric: RhetoricResult | null
  deep: DeepState
  onDeep: () => void
}) {
  const ui = RISK_UI[result.risk]
  const Icon = ui.Icon
  return (
    <div className="space-y-4">
      {/* Banner de riesgo + consejo (ingeniería social) */}
      <Card className={cn('shadow-none', ui.border)}>
        <CardContent className={cn('p-4 sm:p-5', ui.bg)}>
          <div className="flex items-start gap-3">
            <Icon size={22} strokeWidth={1.75} className={cn('mt-0.5 flex-shrink-0', ui.tone)} aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-sm font-semibold', ui.tone)}>{ui.label}</span>
                {result.combo && (
                  <Badge variant="outline" className="text-[10px] font-mono tracking-wider border-bad/40 bg-bad-soft text-bad">
                    FIRMA DE ATAQUE
                  </Badge>
                )}
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed mt-1.5">{result.advice}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gatillos de ingeniería social */}
      {result.hits.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-3">
              Presión / ingeniería social ({result.hits.length})
            </div>
            <ul className="space-y-3">
              {result.hits.map((h) => (
                <li key={h.tactic} className="flex items-start gap-3">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-warn flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{h.label}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {h.evidence.map((e, i) => (
                        <span key={i} className="text-[11px] font-mono rounded bg-muted/50 border border-border px-1.5 py-0.5 text-muted-foreground">
                          &ldquo;{e}&rdquo;
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Técnicas de propaganda / retórica (capa pura) */}
      {rhetoric && rhetoric.hits.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">
                Cómo te intentan convencer ({rhetoric.hits.length})
              </div>
            </div>
            <ul className="space-y-3">
              {rhetoric.hits.map((h) => (
                <li key={h.id} className="flex items-start gap-3">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary/70 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {h.label} <span className="text-muted-foreground font-normal">· {CATEGORY_LABEL[h.category]}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {h.evidence.map((e, i) => (
                        <span key={i} className="text-[11px] font-mono rounded bg-muted/50 border border-border px-1.5 py-0.5 text-muted-foreground">
                          &ldquo;{e}&rdquo;
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Análisis profundo con IA — opt-in, cubre las 23 técnicas */}
      <DeepScanSection deep={deep} onDeep={onDeep} />

      {/* Honestidad: qué NO significa esto */}
      <p className="text-[11px] text-muted-foreground/80 leading-relaxed px-1">
        Esto es una <span className="font-medium text-foreground/70">luz de alerta, no un veredicto</span>. Una señal
        no prueba que sea manipulación, y no detectar señales no prueba que el mensaje sea legítimo. Ante la duda —
        sobre todo si te piden plata, datos o acceso— verificá por un canal que YA tengas (llamá vos), nunca por el
        del mensaje.
      </p>
    </div>
  )
}

function DeepScanSection({ deep, onDeep }: { deep: DeepState; onDeep: () => void }) {
  return (
    <Card className="shadow-none border-primary/25">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles size={14} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">Análisis profundo (IA)</div>
        </div>
        <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
          El scan de arriba corre en tu navegador. Este análisis busca las <span className="text-foreground/80">23 técnicas</span> completas
          — incluidas las que no tienen palabras clave (hombre de paja, pista falsa, desvío). Para esto,{' '}
          <span className="text-foreground/80">el mensaje se envía al modelo</span>; no se guarda.
        </p>

        {deep.kind === 'idle' && (
          <Button size="sm" variant="outline" onClick={onDeep} className="inline-flex items-center gap-1.5">
            <Sparkles size={14} strokeWidth={1.75} /> Analizar en profundidad
          </Button>
        )}
        {deep.kind === 'loading' && (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Analizando…
          </span>
        )}
        {deep.kind === 'error' && (
          <div className="space-y-2">
            <p className="text-sm text-bad">{deep.message}</p>
            <Button size="sm" variant="outline" onClick={onDeep}>Reintentar</Button>
          </div>
        )}
        {deep.kind === 'done' && <DeepResult result={deep.result} />}
      </CardContent>
    </Card>
  )
}

function DeepResult({ result }: { result: DeepScanResult }) {
  return (
    <div className="space-y-3">
      {result.summary && <p className="text-sm text-foreground/90 leading-relaxed">{result.summary}</p>}
      {result.findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No encontré técnicas de manipulación en el mensaje. Se lee directo.</p>
      ) : (
        <ul className="space-y-3">
          {result.findings.map((f, i) => (
            <li key={`${f.id}-${i}`} className="border-l-2 border-primary/40 pl-3">
              <div className="text-sm font-medium text-foreground">
                {f.label} <span className="text-muted-foreground font-normal">· {CATEGORY_LABEL[f.category]}</span>
              </div>
              <p className="text-[13px] text-foreground/85 mt-0.5">&ldquo;{f.quote}&rdquo;</p>
              {f.why && <p className="text-[12px] text-muted-foreground mt-0.5">{f.why}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
