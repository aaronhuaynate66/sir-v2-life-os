'use client'

// SIR V2 — /verificar: detector de manipulación entrante (16·M3, defensa).
//
// Aaron pega un mensaje que le llegó (mail, chat, un pedido raro) y SIR marca los
// gatillos de ingeniería social (autoridad/urgencia/escasez/miedo + Cialdini) y
// le sugiere pausar y verificar. Corre el motor PURO client-side: instantáneo,
// cero costo, cero API. El texto NO se guarda ni se manda a ningún lado.

import { useState } from 'react'
import { ShieldAlert, ShieldCheck, ShieldQuestion, AlertTriangle } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { detectManipulation, type ManipulationResult, type ManipulationRisk } from '@/engines/manipulation'

const RISK_UI: Record<ManipulationRisk, { label: string; tone: string; border: string; bg: string; Icon: typeof ShieldAlert }> = {
  high: { label: 'Riesgo alto', tone: 'text-bad', border: 'border-bad/40', bg: 'bg-bad-soft', Icon: ShieldAlert },
  medium: { label: 'Con señales', tone: 'text-warn', border: 'border-warn/40', bg: 'bg-warn-soft', Icon: AlertTriangle },
  low: { label: 'Señal suelta', tone: 'text-warn', border: 'border-border', bg: 'bg-muted/30', Icon: ShieldQuestion },
  none: { label: 'Sin señales', tone: 'text-ok', border: 'border-ok/40', bg: 'bg-ok-soft', Icon: ShieldCheck },
}

export default function VerificarPage() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<ManipulationResult | null>(null)

  function analyze() {
    if (!text.trim()) { setResult(null); return }
    setResult(detectManipulation(text))
  }
  function clear() { setText(''); setResult(null) }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <ShieldAlert size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Verificar mensaje</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
          Pegá un mensaje que te llegó (mail, chat, un pedido raro) y SIR marca las señales clásicas de
          manipulación — autoridad, urgencia, escasez, miedo. Corre en tu navegador: el texto{' '}
          <span className="text-foreground/80">no se guarda ni se manda a ningún lado.</span>
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

      {result && <ResultView result={result} />}
    </AppShell>
  )
}

function ResultView({ result }: { result: ManipulationResult }) {
  const ui = RISK_UI[result.risk]
  const Icon = ui.Icon
  return (
    <div className="space-y-4">
      {/* Banner de riesgo + consejo */}
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

      {/* Tácticas detectadas con su evidencia */}
      {result.hits.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-3">
              Gatillos detectados ({result.hits.length})
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
