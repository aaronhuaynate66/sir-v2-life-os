'use client'

// SIR V2 — TrajectoryForecastCard (motor de predicción C2). Capa FORECAST de lo
// relacional: NO dice "contactá a X ahora" (eso es el motor proactivo), sino que
// PROYECTA qué vínculos se van a quedar dormidos —y en cuántas semanas— si sigue
// el ritmo de silencio actual. Base: los lazos decaen sin mantenimiento. Se oculta
// si no hay ninguno enfriándose. Orientativo: proyecta el silencio, no la relación.

import { useEffect, useState } from 'react'
import { TrendingDown } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { PersonTrajectory } from '@/lib/prediction/c2/trajectory'

export function TrajectoryForecastCard() {
  const [cooling, setCooling] = useState<PersonTrajectory[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/relational/trajectory')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { cooling?: PersonTrajectory[] } | null) => {
        if (!cancelled && j?.cooling) setCooling(j.cooling)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!cooling || cooling.length === 0) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingDown size={14} strokeWidth={1.75} className="text-warn" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Vínculos enfriándose · pronóstico</h2>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Al ritmo de silencio actual, estos vínculos van hacia dormidos. Un mensaje ahora resetea el reloj.
        </p>
        <ul className="space-y-2">
          {cooling.slice(0, 6).map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 border-t border-border/40 pt-2 first:border-t-0 first:pt-0">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{t.name}</div>
                <div className="text-[11px] text-muted-foreground">{t.basis}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs tabular-nums font-medium">
                  {t.weeksToDormant != null ? `~${t.weeksToDormant} sem` : '—'}
                </div>
                <Badge variant="outline" className="mt-0.5 text-[9px] font-normal">
                  {t.status === 'going_dormant' ? 'urgente' : 'enfriándose'} · conf. {t.confidence}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          Orientativo: proyecta el silencio contra la cadencia habitual, no lee la relación.
        </p>
      </CardContent>
    </Card>
  )
}
