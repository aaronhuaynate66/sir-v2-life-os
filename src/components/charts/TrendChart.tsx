'use client'
// SIR V2 — TrendChart (Feature 3 + viz interactiva estilo health-app).
//
// Línea + área en SVG (paths estirados con preserveAspectRatio=none, stroke no
// escalado). PERO los DOTS, las etiquetas de valor y el tooltip van como overlay
// HTML posicionado por %: el SVG estirado deformaría círculos/textos. Así quedan
// crispos a cualquier ancho. Geometría delegada a buildLineSeries (lib pura).
//
// Interacción (patrón Huawei): un dot por registro, etiqueta de valor en el
// MÍN y el MÁX (sin saturar), y un scrubber con tooltip (fecha+valor) al pasar
// o tocar. El chip ↗/↘ compara contra el registro ANTERIOR (aclarado con 'vs ant.').

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { buildLineSeries, filterPointsByRange, hasOlderThanRange, rangeAxisEdges, rangeBounds, rangeWindowLabel, type ChartRange } from '@/lib/charts/series'
import type { SeriesPoint } from '@/lib/charts/series'
import { cn } from '@/lib/utils'

const DOW_ABBR = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MON_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** 'YYYY-MM-DD…' → '12 jun' (día + mes). Día+mes evita la ambigüedad de "mar"
 *  (martes vs marzo) en el eje. Parse local (sin TZ). */
function fmtDayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso.slice(0, 10)
  return `${d} ${MON_ABBR[m - 1]}`
}
/** Etiqueta de eje; agrega el año (''AA) cuando la serie cruza años, para que
 *  no parezca invertida (ej. '26 jun '25' vs '8 jun '26'). */
function fmtAxisLabel(iso: string, withYear: boolean): string {
  const base = fmtDayLabel(iso)
  if (!withYear) return base
  const y = iso.slice(2, 4)
  return `${base} '${y}`
}
/** 'YYYY-MM-DD…' → 'vie 12 jun' (para el tooltip). */
function fmtDayLong(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso.slice(0, 10)
  const dt = new Date(y, m - 1, d)
  return `${DOW_ABBR[dt.getDay()]} ${d} ${MON_ABBR[m - 1]}`
}

export interface TrendChartProps {
  label: string
  icon: LucideIcon
  points: SeriesPoint[]
  colorClass?: string
  formatValue?: (n: number) => string
  height?: number
  emptyHint?: string
  className?: string
  /** Muestra un toggle Semana/Mes que filtra los puntos a esa ventana. */
  windowable?: boolean
  /** Ventana inicial cuando windowable (default 'semana'). Ignorado si
   *  el padre pasa `range` (modo controlled). */
  defaultRange?: ChartRange
  /** Notifica los puntos efectivamente MOSTRADOS (tras ventana/offset), para
   *  que el contenedor calcule stats sobre la misma ventana. */
  onShownChange?: (points: SeriesPoint[]) => void
  /** CONTROLLED: si viene, sobreescribe el state interno y OCULTA el toggle
   *  Semana/Mes del propio chart (asume que el padre pinta uno global). */
  range?: ChartRange
  /** CONTROLLED: si viene, sobreescribe el offset interno y OCULTA los chevrons
   *  «/» del propio chart. Combinar con range para modo totalmente controlado. */
  offset?: number
  onRangeChange?: (r: ChartRange) => void
  onOffsetChange?: (o: number) => void
}

const VIEW_W = 320

export function TrendChart({
  label,
  icon,
  points,
  colorClass = 'text-brand',
  formatValue = (n) => String(n),
  height = 72,
  emptyHint,
  className,
  windowable = false,
  defaultRange = 'semana',
  onShownChange,
  range: controlledRange,
  offset: controlledOffset,
  onRangeChange,
  onOffsetChange,
}: TrendChartProps) {
  const [innerRange, setInnerRange] = useState<ChartRange>(defaultRange)
  const [innerOffset, setInnerOffset] = useState(0)
  // Detecta modo controlled: si el padre pasa `range` (o `offset`), usamos ese
  // valor y ocultamos el control interno (asume toggle global arriba).
  const isRangeControlled = controlledRange !== undefined
  const isOffsetControlled = controlledOffset !== undefined
  const range = isRangeControlled ? controlledRange : innerRange
  const offset = isOffsetControlled ? controlledOffset : innerOffset
  const shown = useMemo(
    () => (windowable ? filterPointsByRange(points, range, new Date(), offset) : points),
    [windowable, points, range, offset],
  )
  useEffect(() => { onShownChange?.(shown) }, [shown, onShownChange])
  const canOlder = useMemo(
    () => (windowable ? hasOlderThanRange(points, range, offset) : false),
    [windowable, points, range, offset],
  )
  const windowLabel = windowable ? rangeWindowLabel(range, offset) : ''
  function changeRange(r: ChartRange) {
    if (isRangeControlled) onRangeChange?.(r)
    else { setInnerRange(r); setInnerOffset(0) }
    // Cambiar range resetea offset a 0 también en modo controlled.
    if (isOffsetControlled) onOffsetChange?.(0)
    else if (isRangeControlled) setInnerOffset(0)
  }
  function changeOffset(delta: -1 | 1) {
    const next = delta === 1 ? offset + 1 : Math.max(0, offset - 1)
    if (isOffsetControlled) onOffsetChange?.(next)
    else setInnerOffset(next)
  }
  // Cuando windowable, el eje X del chart debe cubrir la VENTANA CALENDARIO
  // (lun→dom o el mes completo), no solo el span de los puntos existentes.
  // Sin esto, con 2 puntos en la semana el chart los distribuye a los extremos
  // izquierdo/derecho y parece que "esa semana solo tuvo 2 días".
  const xDomain = useMemo(
    () => (windowable ? rangeBounds(range, offset) : undefined),
    [windowable, range, offset],
  )
  const geo = useMemo(
    () => buildLineSeries(shown, { width: VIEW_W, height, padding: 6, xDomain }),
    [shown, height, xDomain],
  )
  // Labels del eje X: cuando windowable, mostrar bordes de la ventana (para que
  // se lea "lun 29 jun" – "dom 5 jul" incluso si los puntos están en el medio).
  const axisEdges = useMemo(
    () => (windowable ? rangeAxisEdges(range, offset) : null),
    [windowable, range, offset],
  )

  const hasData = geo.points.length > 0
  const delta = geo.delta

  const TrendIcon: LucideIcon =
    delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
  const trendColor =
    delta == null || delta === 0
      ? 'text-muted-foreground'
      : delta > 0
        ? 'text-ok'
        : 'text-bad'

  return (
    <Card className={cn('shadow-none', className)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={icon} label={label} count={hasData ? geo.points.length : undefined} />
          {windowable && !isRangeControlled && (
            <div className="flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5 text-[11px] flex-shrink-0">
              {(['semana', 'mes'] as ChartRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => changeRange(r)}
                  className={cn(
                    'px-2 py-0.5 rounded capitalize transition-colors',
                    range === r ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        {windowable && !isOffsetControlled && (
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <button type="button" onClick={() => changeOffset(1)} disabled={!canOlder}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 enabled:hover:bg-muted/50 disabled:opacity-30" aria-label="Período anterior">
              <ChevronLeft size={14} />
            </button>
            <span className="font-mono tabular-nums">{offset === 0 ? (range === 'semana' ? 'Esta semana' : 'Este mes') : windowLabel}</span>
            <button type="button" onClick={() => changeOffset(-1)} disabled={offset === 0}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 enabled:hover:bg-muted/50 disabled:opacity-30" aria-label="Período siguiente">
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {!hasData ? (
          <p className="text-sm text-muted-foreground py-2">
            {windowable ? `Sin datos en ${offset === 0 ? (range === 'semana' ? 'esta semana' : 'este mes') : windowLabel}.` : (emptyHint ?? 'Sin datos todavía. Registrá algunos para ver la tendencia.')}
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
                <div className="flex items-center gap-1.5">
                  <div className={cn('flex items-center gap-1 text-xs', trendColor)}>
                    <TrendIcon size={13} strokeWidth={2} aria-hidden="true" />
                    <span className="font-mono tabular-nums">
                      {delta > 0 ? '+' : ''}
                      {formatValue(delta)}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/50">vs ant.</span>
                </div>
              )}
            </div>

            <ChartViz geo={geo} colorClass={colorClass} label={label} formatValue={formatValue} />

            <div className="flex justify-between text-[10px] font-mono text-muted-foreground/50">
              {(() => {
                // Cuando windowable, los bordes son los de la ventana calendario
                // (lun→dom o mes), no los primeros/últimos puntos existentes.
                const leftIso = axisEdges?.leftDate ?? geo.first!.date
                const rightIso = axisEdges?.rightDate ?? geo.last!.date
                const spanYears = leftIso.slice(0, 4) !== rightIso.slice(0, 4)
                return (<>
                  <span>{fmtAxisLabel(leftIso, spanYears)}</span>
                  <span>{fmtAxisLabel(rightIso, spanYears)}</span>
                </>)
              })()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ChartViz({
  geo,
  colorClass,
  label,
  formatValue,
}: {
  geo: ReturnType<typeof buildLineSeries>
  colorClass: string
  label: string
  formatValue: (n: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const W = geo.width
  const H = geo.height
  const pts = geo.points

  // Índices del mínimo y máximo por valor (para las etiquetas tipo Huawei).
  let iMin = 0
  let iMax = 0
  pts.forEach((p, i) => {
    if (p.value < pts[iMin].value) iMin = i
    if (p.value > pts[iMax].value) iMax = i
  })

  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || pts.length === 0) return
    const r = el.getBoundingClientRect()
    if (r.width === 0) return
    const vx = ((e.clientX - r.left) / r.width) * W
    let best = 0
    let bd = Infinity
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - vx)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    setHover(best)
  }

  const hp = hover != null && hover < pts.length ? pts[hover] : null
  const pct = (v: number, total: number) => `${(v / total) * 100}%`
  // Mientras hay hover, ocultamos las etiquetas estáticas para no encimar.
  const staticLabels = hp ? [] : Array.from(new Set([iMin, iMax]))

  return (
    <div
      ref={ref}
      className={cn('relative w-full touch-none select-none', colorClass)}
      style={{ height: H }}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={`Tendencia de ${label}`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        className="overflow-visible"
        aria-hidden="true"
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
        {hp && (
          <line
            x1={hp.x}
            y1={0}
            x2={hp.x}
            y2={H}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Dots (HTML → crispos, sin deformación del SVG estirado). */}
      {pts.map((p, i) => (
        <span
          key={`dot-${i}`}
          className={cn(
            'absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-current pointer-events-none transition-all',
            hover === i ? 'w-2.5 h-2.5 ring-2 ring-background' : 'w-1.5 h-1.5',
          )}
          style={{ left: pct(p.x, W), top: pct(p.y, H) }}
        />
      ))}

      {/* Etiquetas de valor en mín/máx (estilo Huawei): máx arriba, mín abajo. */}
      {staticLabels.map((i) => (
        <span
          key={`lbl-${i}`}
          className="absolute -translate-x-1/2 text-[10px] font-mono tabular-nums text-muted-foreground/70 whitespace-nowrap pointer-events-none"
          style={{
            left: pct(pts[i].x, W),
            top: pct(pts[i].y, H),
            transform: `translate(-50%, ${i === iMax ? '-180%' : '60%'})`,
          }}
        >
          {formatValue(pts[i].value)}
        </span>
      ))}

      {/* Tooltip del scrubber: fecha + valor del punto bajo el cursor/dedo. */}
      {hp && (
        <div
          className="absolute z-10 -translate-x-1/2 pointer-events-none"
          style={{ left: pct(hp.x, W), top: 0 }}
        >
          <div className="-translate-y-full -mt-1 rounded-md border border-border bg-popover px-2 py-1 text-center shadow-sm">
            <div className="text-[11px] font-mono font-semibold tabular-nums text-foreground leading-tight">
              {formatValue(hp.value)}
            </div>
            <div className="text-[9px] font-mono text-muted-foreground/70 leading-tight">
              {fmtDayLong(hp.date)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
