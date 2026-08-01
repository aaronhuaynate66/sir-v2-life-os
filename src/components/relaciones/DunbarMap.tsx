'use client'

// SIR V2 — DunbarMap (15·1): mapa de la red por capas de Dunbar + alertas de
// sobre/sub-inversión. Lee las personas del store, corre el motor puro
// `engines/dunbar` y muestra cada capa (cuántos vs. el tamaño de referencia) +
// las alertas accionables. Se oculta si no hay gente cargada.

import { useMemo } from 'react'
import { Network, AlertCircle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { useRelationshipStore } from '@/stores'
import { analyzeDunbar, type DunbarCategory, type DunbarSeverity } from '@/engines/dunbar'
import { cn } from '@/lib/utils'

const VALID: DunbarCategory[] = ['inner_circle', 'close', 'network', 'peripheral']
const SEV_TONE: Record<DunbarSeverity, string> = { high: 'text-bad', medium: 'text-warn', low: 'text-muted-foreground' }
const SEV_BORDER: Record<DunbarSeverity, string> = { high: 'border-bad/30 bg-bad-soft', medium: 'border-warn/30 bg-warn-soft', low: 'border-border bg-muted/20' }

export function DunbarMap() {
  const people = useRelationshipStore((s) => s.people)

  const result = useMemo(() => {
    const input = people
      .filter((p) => VALID.includes(p.category as DunbarCategory))
      .map((p) => ({ id: p.id, name: p.name, category: p.category as DunbarCategory, lastContact: p.lastContact ?? null }))
    return analyzeDunbar(input, Date.now())
  }, [people])

  if (result.total === 0) return null

  return (
    <Card className="shadow-none mb-6">
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Network} label="Mapa de tu red · capas de Dunbar" count={result.total} />
        <p className="text-[11px] text-muted-foreground mb-4 leading-snug">
          Tu capacidad para relaciones es finita y se organiza en capas. Cada una pide una cadencia distinta —
          al círculo íntimo lo cuidas seguido; a la periferia, de vez en cuando.
        </p>

        {/* Capas */}
        <div className="space-y-2.5">
          {result.layers.map((l) => {
            const pct = l.softCap > 0 ? Math.min(100, Math.round((l.count / l.softCap) * 100)) : 0
            return (
              <div key={l.category}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs text-foreground">{l.label}</span>
                  <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                    {l.count}<span className="text-muted-foreground/50"> / ~{l.softCap}</span>
                    {l.staleCount > 0 && <span className="text-warn ml-2">{l.staleCount} sin contacto</span>}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', l.overCap ? 'bg-warn' : 'bg-brand/60')}
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Alertas */}
        {result.alerts.length > 0 && (
          <div className="mt-4 border-t border-border/50 pt-3 space-y-2">
            {result.alerts.map((a, i) => (
              <div key={i} className={cn('rounded-md border px-3 py-2', SEV_BORDER[a.severity])}>
                <div className="flex items-start gap-2">
                  <AlertCircle size={13} strokeWidth={1.75} className={cn('mt-0.5 flex-shrink-0', SEV_TONE[a.severity])} aria-hidden="true" />
                  <div className="min-w-0">
                    <div className={cn('text-xs font-medium', SEV_TONE[a.severity] === 'text-muted-foreground' ? 'text-foreground' : SEV_TONE[a.severity])}>{a.title}</div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{a.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
