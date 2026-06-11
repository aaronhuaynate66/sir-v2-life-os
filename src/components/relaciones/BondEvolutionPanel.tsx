'use client'

// SIR V2 — "Evolución del vínculo" (Etapa 2: detección estructurada del cambio).
//
// Lee los snapshots diarios del score de ESTA persona (GET, sin efecto
// secundario) y muestra los QUIEBRES reales en el tiempo (buildBondEvolution):
// "el vínculo subió de 70 a 82 esta semana". Calmo y honesto — si no hay
// historial suficiente, lo dice; no inventa.

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { buildBondEvolution, type BondEvolution } from '@/lib/people/bondEvolution'

export interface BondEvolutionPanelProps {
  personId: string
}

export function BondEvolutionPanel({ personId }: BondEvolutionPanelProps) {
  const [evo, setEvo] = useState<BondEvolution | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/person-score/snapshot')
        if (!res.ok) return
        const data = (await res.json()) as { snapshots?: { personId: string; dateBucket: string; global: number }[] }
        if (cancelled || !Array.isArray(data.snapshots)) return
        const mine = data.snapshots
          .filter((s) => s.personId === personId)
          .map((s) => ({ dateBucket: s.dateBucket, global: s.global }))
        setEvo(buildBondEvolution(mine))
      } catch {
        // best-effort: el panel es opcional.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [personId])

  const trend = evo?.trend
  const hasShifts = (evo?.shifts.length ?? 0) > 0
  const insufficient = !trend || trend.direction === 'insufficient_data'

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Evolución del vínculo</div>
        </div>

        {insufficient && !hasShifts ? (
          <p className="text-sm text-muted-foreground py-1">
            Necesito unos días de historial para leer cómo evoluciona el vínculo. Se irá marcando solo. 🌱
          </p>
        ) : (
          <div className="space-y-3">
            {trend && trend.direction !== 'insufficient_data' && (
              <div className="flex items-center gap-2 text-sm">
                {trend.direction === 'improving' ? (
                  <TrendingUp size={15} strokeWidth={1.75} style={{ color: 'hsl(var(--success))' }} aria-hidden="true" />
                ) : trend.direction === 'declining' ? (
                  <TrendingDown size={15} strokeWidth={1.75} style={{ color: 'hsl(var(--destructive))' }} aria-hidden="true" />
                ) : (
                  <Minus size={15} strokeWidth={1.75} className="text-muted-foreground" aria-hidden="true" />
                )}
                <span className="text-foreground">
                  {trend.direction === 'improving'
                    ? 'Viene mejorando'
                    : trend.direction === 'declining'
                      ? 'Viene bajando'
                      : 'Estable'}
                </span>
                {trend.delta !== null && trend.direction !== 'stable' && (
                  <span className="font-mono tabular-nums text-muted-foreground text-xs">
                    {trend.delta > 0 ? `+${trend.delta}` : trend.delta} pts
                    {trend.comparedDays ? ` · ${trend.comparedDays} d` : ''}
                  </span>
                )}
              </div>
            )}

            {hasShifts && (
              <ul className="space-y-2">
                {evo!.shifts.slice(0, 4).map((sh, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px]">
                    <span
                      className="mt-1.5 shrink-0"
                      style={{ width: 7, height: 7, borderRadius: 4, background: sh.direction === 'up' ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}
                      aria-hidden="true"
                    />
                    <span className="text-foreground/90">{sh.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
