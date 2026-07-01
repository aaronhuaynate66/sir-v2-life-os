'use client'

// SIR V2 — ScoreTrendChip: chip micro que muestra la tendencia del score
// relacional con una persona (↑ / ↓ / =) en la lista /relaciones. Lee la
// trend calculada por useScoreTrendsByPerson (single fetch, agrupado).
//
// Filosofía: dar visibilidad AL LADO del nombre — sin abrir la ficha, Aaron
// ve de un vistazo qué vínculos están subiendo, cuáles bajando, cuáles
// estables. Es un lente sobre datos que ya existen (mig 0066 + cron
// score-snapshots) — no agrega telemetría nueva.
//
// Estados:
//   - improving → ↑ verde con delta
//   - declining → ↓ rojo con delta
//   - stable    → = tenue (opcional: se muestra solo si hay ≥7d de comparación)
//   - insufficient_data → null (no renderiza)

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScoreTrend } from '@/lib/people/scoreTrend'

interface ScoreTrendChipProps {
  trend: ScoreTrend | undefined
  /** Cuando 'compact' oculta el delta numérico (solo el ícono). Default false. */
  variant?: 'compact' | 'full'
}

export function ScoreTrendChip({ trend, variant = 'full' }: ScoreTrendChipProps) {
  if (!trend || trend.direction === 'insufficient_data' || trend.delta == null) return null
  // 'stable' con comparación corta no aporta lectura — se oculta.
  if (trend.direction === 'stable' && (trend.comparedDays ?? 0) < 7) return null

  const Icon = trend.direction === 'improving' ? TrendingUp : trend.direction === 'declining' ? TrendingDown : Minus
  const color =
    trend.direction === 'improving'
      ? 'text-ok'
      : trend.direction === 'declining'
        ? 'text-bad'
        : 'text-muted-foreground/70'
  const label =
    trend.direction === 'improving'
      ? 'Bond subiendo'
      : trend.direction === 'declining'
        ? 'Bond bajando'
        : 'Bond estable'
  const deltaTxt = trend.delta > 0 ? `+${trend.delta}` : String(trend.delta)

  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-mono tabular-nums', color)}
      title={`${label} (${deltaTxt} pts en ${trend.comparedDays ?? 0} días)`}
    >
      <Icon size={12} strokeWidth={1.75} aria-hidden="true" />
      {variant === 'full' && <span>{deltaTxt}</span>}
    </span>
  )
}
