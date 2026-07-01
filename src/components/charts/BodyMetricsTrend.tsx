'use client'
// SIR V2 — Tendencia corporal (/yo). Serie temporal de health_metrics con
// selector de métrica + stats del período. Reusa TrendChart (SVG propio, sin
// libs de charting) y el adapter puro healthMetricSeries.
//
// Antes /yo sólo mostraba health_metrics como lista plana de últimos valores;
// los trends de Feature 3 apuntaban a self_metrics/sleep (vacíos). Esto dibuja
// la evolución real de peso/grasa/masa musculoesquelética/etc. de la báscula.

import { useMemo, useState } from 'react'
import { LineChart } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { TrendChart } from './TrendChart'
import { healthMetricSeries } from '@/lib/charts/adapters'
import { buildLineSeries, type ChartRange, type SeriesPoint } from '@/lib/charts/series'
import { getHealthMetricLabel } from '@/lib/health-metrics/labels'
import { cn } from '@/lib/utils'
import type { HealthMetric, HealthMetricType } from '@/types'

// Las 3 que pidió Aaron primero (Peso / Grasa corporal / Masa musculoesquelética);
// el resto en un orden razonable. Tipos fuera de la lista van al final.
const PRIORITY: HealthMetricType[] = [
  'weight',
  'body_fat_percent',
  'skeletal_muscle_mass_kg',
  'muscle_mass_kg',
  'bmi',
  'water_percent',
  'protein_percent',
  'bone_mass_kg',
  'visceral_fat_level',
  'metabolic_rate_kcal',
  'metabolic_age',
  'body_score',
  'ideal_weight_kg',
  'hrv_avg',
  'hrv_min',
  'hrv_max',
]

function rank(t: HealthMetricType): number {
  const i = PRIORITY.indexOf(t)
  return i === -1 ? PRIORITY.length : i
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

interface BodyMetricsTrendProps {
  metrics: HealthMetric[]
  /** Modo controlled desde el padre (toggle global de /salud). */
  range?: ChartRange
  offset?: number
}

export function BodyMetricsTrend({ metrics, range, offset }: BodyMetricsTrendProps) {
  // Tipos presentes en la data, ordenados por prioridad.
  const availableTypes = useMemo(() => {
    const present = new Set<HealthMetricType>()
    // heart_rate_high_alerts es un CONTEO episódico, no una serie corporal en
    // unidades comparables → tiene su propio panel (HeartRateAlertsPanel).
    for (const m of metrics) if (m.type !== 'heart_rate_high_alerts') present.add(m.type)
    return [...present].sort((a, b) => rank(a) - rank(b))
  }, [metrics])

  const [selected, setSelected] = useState<HealthMetricType>('weight')
  // Si la selección no está disponible (o cambió la data), caer al primero.
  const active = availableTypes.includes(selected) ? selected : availableTypes[0]

  const series = useMemo(
    () => (active ? healthMetricSeries(metrics, active) : []),
    [metrics, active],
  )
  // Puntos efectivamente mostrados por TrendChart (ventana/offset) → stats sobre
  // la MISMA ventana, no sobre toda la serie.
  const [shown, setShown] = useState<SeriesPoint[]>([])
  const statsPts = shown.length > 0 ? shown : series
  const geo = useMemo(() => buildLineSeries(statsPts), [statsPts])

  // Unidad del tipo activo (de la lectura más reciente de ese tipo).
  const unit = useMemo(() => {
    if (!active) return ''
    const ofType = metrics.filter((m) => m.type === active)
    return ofType.length ? ofType[ofType.length - 1].unit : ''
  }, [metrics, active])

  const fmt = (n: number) => {
    const v = String(round1(n))
    if (!unit) return v
    return unit === '%' ? `${v}%` : `${v} ${unit}`
  }

  // Sin ninguna métrica corporal → empty state honesto.
  if (availableTypes.length === 0 || !active) {
    return (
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-6">
          <SectionHeader />
          <p className="text-sm text-muted-foreground py-2">
            Sin métricas corporales todavía. Subí una captura de báscula para ver la tendencia.
          </p>
        </CardContent>
      </Card>
    )
  }

  const enoughData = series.length >= 2
  const avg = statsPts.length ? statsPts.reduce((acc, p) => acc + p.value, 0) / statsPts.length : 0

  return (
    <div className="space-y-3">
      {/* Selector de métrica — fila de pills scrolleable (mobile-friendly). */}
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <SectionHeader />
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Métrica corporal">
            {availableTypes.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={t === active}
                onClick={() => setSelected(t)}
                className={cn(
                  'flex-shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
                  t === active
                    ? 'border-primary/40 bg-primary/10 text-foreground font-medium'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30',
                )}
              >
                {getHealthMetricLabel(t)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {!enoughData ? (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-6">
            <p className="text-sm text-muted-foreground py-2">
              {series.length === 1
                ? `Solo 1 registro de ${getHealthMetricLabel(active)} (${fmt(series[0].value)}). Necesitás 2+ capturas para ver la tendencia.`
                : `Sin registros de ${getHealthMetricLabel(active)} todavía.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Línea de la métrica seleccionada (header con actual + Δ + fechas). */}
          <TrendChart
            label={getHealthMetricLabel(active)}
            icon={LineChart}
            points={series}
            colorClass="text-primary"
            formatValue={fmt}
            height={120}
            windowable
            defaultRange="mes"
            range={range}
            offset={offset}
            onShownChange={setShown}
          />

          {/* Stats del período visible. */}
          <Card className="shadow-none">
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Registros" value={String(statsPts.length)} />
                <Stat label="Promedio" value={fmt(avg)} />
                <Stat label="Máx" value={fmt(geo.max)} />
                <Stat label="Mín" value={fmt(geo.min)} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function SectionHeader() {
  return (
    <div className="flex items-center gap-2 mb-3">
      <LineChart size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
      <h2 className="text-sm font-medium text-foreground">Tendencia corporal</h2>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{label}</div>
      <div className="text-base sm:text-lg font-mono font-semibold tabular-nums">{value}</div>
    </div>
  )
}
