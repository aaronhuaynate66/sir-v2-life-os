'use client'

// SIR V2 — Recalibrar tono histórico (backfill puntual).
//
// El 92% de los logs de interacción quedaron en tono neutro (3) por un bug de
// rúbrica (ya arreglado para adelante). Este panel dispara la re-inferencia del
// tono LEYENDO las notas viejas. Dry-run primero (ver la propuesta), aplicar
// después. Solo toca los value=3 → reversible.

import { useCallback, useState } from 'react'
import { Gauge, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface DryResult {
  mode: 'dry' | 'apply'
  total: number
  changed: number
  applied?: number
  skipped?: number
  newDistribution?: Record<string, number>
  sample?: { to: number; note: string }[]
  message?: string
}

export function RecalibrarTonoPanel() {
  const [loading, setLoading] = useState<false | 'dry' | 'apply'>(false)
  const [err, setErr] = useState<string | null>(null)
  const [dry, setDry] = useState<DryResult | null>(null)
  const [applied, setApplied] = useState<DryResult | null>(null)

  const run = useCallback(async (apply: boolean) => {
    setLoading(apply ? 'apply' : 'dry')
    setErr(null)
    try {
      const res = await fetch('/api/relato/reprocess-tone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apply ? { apply: true } : { apply: false }),
      })
      const j = (await res.json()) as DryResult & { error?: string; detail?: string }
      if (!res.ok) { setErr(j.error ?? 'Falló'); return }
      if (apply) setApplied(j); else setDry(j)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falló')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <Card className="shadow-none mb-4 border-warn/20">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Gauge size={14} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Recalibrar tono histórico</span>
        </div>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Re-lee tus interacciones tipeadas que quedaron en tono neutro (3) y les asigna un tono más
          fiel (1-5). <span className="text-foreground/80">Solo toca notas con contenido real</span> —
          las llamadas y los import-markers (que son la mayoría de los 3) se saltan solos. Empieza por
          el dry-run; es reversible.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={loading !== false} onClick={() => void run(false)}>
            {loading === 'dry' ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
            Ver propuesta (dry-run)
          </Button>
          {dry && dry.changed > 0 && (
            <Button size="sm" disabled={loading !== false} onClick={() => void run(true)}>
              {loading === 'apply' ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Aplicar a todo
            </Button>
          )}
        </div>

        {err && <p className="text-[12px] text-bad">{err}</p>}

        {dry && !applied && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2 text-[12px]">
            <p className="text-foreground">
              Muestra de {dry.total}: <span className="font-medium">{dry.changed}</span> cambiarían de tono.
              {dry.newDistribution && (
                <span className="text-muted-foreground"> Nueva distribución: {JSON.stringify(dry.newDistribution)}</span>
              )}
            </p>
            {dry.sample && dry.sample.length > 0 && (
              <ul className="space-y-1">
                {dry.sample.map((s, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="font-mono text-foreground">3→{s.to}</span> · {s.note}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground/70">
              Si la propuesta pinta bien, aplica a todo. Se procesan todos tus logs en 3 (puede tardar ~1 min).
            </p>
          </div>
        )}

        {applied && (
          <div className="rounded-md border border-ok/25 bg-ok-soft/40 p-3 text-[12px] text-foreground">
            Listo: {applied.applied ?? 0} de {applied.total} registros recalibrados.
            {applied.newDistribution && (
              <span className="text-muted-foreground"> Distribución: {JSON.stringify(applied.newDistribution)}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
