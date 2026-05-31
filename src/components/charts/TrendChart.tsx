'use client'
// SIR V2 — TrendChart (Feature 3: gráficos de tendencias, viz SVG propia).
//
// Línea + área sobre una serie {date, value}, sin librerías de charting
// (mismo espíritu que el donut del ciclo). Geometría delegada a
// buildLineSeries (lib pura, testeada). El color sale de `colorClass` vía
// currentColor → respeta el theme.
//
// Render: header con valor actual + delta (chip), y el SVG. Empty state si
// no hay puntos. La preparación de la serie la hace el caller (adapters),
// este componente sólo dibuja.

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { buildLineSeries, type SeriesPoint } from '@/lib/charts/series'
import { cn } from '@/lib/utils'

export interface TrendChartProps {
  /** Título de la sección. */
  label: string
  icon: LucideIcon
  /** Puntos ya preparados por un adapter (orden indistinto). */
  points: SeriesPoint[]
  /** Clase de color de texto para la línea/área (ej. "text-emerald-400"). */
  colorClass?: string
  /** Formateador del valor (ej. formatPEN, o n => `${n}h`). Default toString. */
  formatValue?: (n: number) => string
  /** Alto del SVG en px. Default 56. */
  height?: number
  /** Mensaje de empty state. */
  emptyHint?: string
  className?: string
}

const VIEW_W = 320

export function TrendChart({
  label,
  icon,
  points,
  colorClass = 'text-primary',
  formatValue = (n) => String(n),
  height = 56,
  emptyHint,
  className,
}: TrendChartProps) {
  const geo = useMemo(
    () => buildLineSeries(points, { width: VIEW_W, height, padding: 4 }),
    [points, height],
  )

  const hasData = geo.points.length > 0
  const delta = geo.delta

  const TrendIcon: LucideIcon =
    delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
  const trendColor =
    delta == null || delta === 0
      ? 'text-muted-foreground'
      : delta > 0
        ? 'text-emerald-400'
        : 'text-red-400'

  return (
    <Card className={cn('shadow-none', className)}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={icon} label={label} count={hasData ? geo.points.length : undefined} />

        {!hasData ? (
          <p className="text-sm text-muted-foreground py-2">
            {emptyHint ?? 'Sin datos todavía. Registrá algunos para ver la tendencia.'}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-semibold tabular-nums">
                  {formatValue(geo.last!.value)}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
                  actual
                </span>
              </div>
              {delta != null && (
                <div className={cn('flex items-center gap-1 text-xs', trendColor)}>
                  <TrendIcon size={13} strokeWidth={2} aria-hidden="true" />
                  <span className="font-mono tabular-nums">
                    {delta > 0 ? '+' : ''}
                    {formatValue(delta)}
                  </span>
                </div>
              )}
            </div>

            <ChartSvg geo={geo} colorClass={colorClass} label={label} />

            <div className="flex justify-between text-[10px] font-mono text-muted-foreground/50">
              <span>{geo.first!.date.slice(0, 10)}</span>
              <span>{geo.last!.date.slice(0, 10)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ChartSvg({
  geo,
  colorClass,
  label,
}: {
  geo: ReturnType<typeof buildLineSeries>
  colorClass: string
  label: string
}) {
  const last = geo.points[geo.points.length - 1]
  return (
    <svg
      viewBox={`0 0 ${geo.width} ${geo.height}`}
      width="100%"
      height={geo.height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Tendencia de ${label}`}
      className={cn('overflow-visible', colorClass)}
    >
      {geo.areaPath && (
        <path d={geo.areaPath} fill="currentColor" fillOpacity={0.1} stroke="none" />
      )}
      <path
        d={geo.linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {last && (
        <circle cx={last.x} cy={last.y} r={2.5} fill="currentColor" stroke="none" />
      )}
    </svg>
  )
}
