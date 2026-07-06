'use client'

// SIR V2 — "Efecto de tus vínculos" (C2·R1: efecto partner con shrinkage).
//
// Quién te energiza / te drena, estimado desde tus ratings de interacción con
// partial pooling (los vínculos con pocos datos se encogen hacia la media → no
// falsos positivos). Best-effort: si no hay señal fuerte, no aparece.

import { useEffect, useState } from 'react'
import { BatteryCharging, BatteryLow, ArrowUp, ArrowDown } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

interface Effect { personId: string; personName: string; n: number; confidence: string; trend: string | null }

function ConfDot({ c }: { c: string }) {
  const color = c === 'alta' ? 'hsl(var(--success))' : c === 'media' ? 'hsl(var(--warning, 45 90% 45%))' : 'hsl(var(--muted-foreground))'
  return <span title={`confianza ${c}`} aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 4, background: color, display: 'inline-block' }} />
}

function Row({ e }: { e: Effect }) {
  return (
    <li className="flex items-center gap-2 text-[13px]">
      <ConfDot c={e.confidence} />
      <span className="text-foreground/90 truncate flex-1">{e.personName}</span>
      {e.trend === 'sube' && <ArrowUp size={12} strokeWidth={2} style={{ color: 'hsl(var(--success))' }} aria-label="mejorando" />}
      {e.trend === 'baja' && <ArrowDown size={12} strokeWidth={2} style={{ color: 'hsl(var(--destructive))' }} aria-label="bajando" />}
      <span className="font-mono tabular-nums text-muted-foreground text-[11px] shrink-0">n={e.n}</span>
    </li>
  )
}

export function PartnerEffectBoard() {
  const [data, setData] = useState<{ energizing: Effect[]; draining: Effect[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/relational/partner-effects')
        if (!res.ok) return
        const j = (await res.json()) as { energizing?: Effect[]; draining?: Effect[] }
        if (!cancelled) setData({ energizing: j.energizing ?? [], draining: j.draining ?? [] })
      } catch { /* opcional */ }
    })()
    return () => { cancelled = true }
  }, [])

  if (!data || (data.energizing.length === 0 && data.draining.length === 0)) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Efecto de tus vínculos</div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">Desde tus registros de interacción. Los de pocos datos se ajustan hacia la media (sin falsos positivos).</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.energizing.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[13px] mb-1.5" style={{ color: 'hsl(var(--success))' }}>
                <BatteryCharging size={14} strokeWidth={1.75} aria-hidden="true" /> Te energizan
              </div>
              <ul className="space-y-1">{data.energizing.map((e) => <Row key={e.personId} e={e} />)}</ul>
            </div>
          )}
          {data.draining.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[13px] mb-1.5" style={{ color: 'hsl(var(--destructive))' }}>
                <BatteryLow size={14} strokeWidth={1.75} aria-hidden="true" /> Te drenan
              </div>
              <ul className="space-y-1">{data.draining.map((e) => <Row key={e.personId} e={e} />)}</ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
