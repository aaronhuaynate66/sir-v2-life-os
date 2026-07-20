'use client'
// SIR V2 — Tendencia de salud, SEPARADA en dos familias (rediseño jul 2026).
//
// Antes: 14 métricas (peso Y corazón) apiladas en UN solo selector "Tendencia
// corporal" → cada familia perdía protagonismo. Ahora se parten en dos tarjetas
// con lenguajes distintos, porque son ejes fisiológicos independientes que
// cambian a ritmos incompatibles:
//   · CUERPO / composición  → tendencia LENTA (semanas): peso, grasa, músculo…
//   · CORAZÓN / cardiovascular → lectura DIARIA vs. tu baseline: FC, VFC, SpO₂…
// Base científica: composición (estructura) vs. función autonómica se predicen
// aparte ("fat but fit"); la VFC no tiene rango universal → se lee contra el
// promedio personal, no una tabla (estilo Garmin HRV Status).
//
// Cada familia: selector de métrica (pills) + TrendChart + banda de rango
// saludable con estado (ok/atención) para las métricas con referencia clínica.

import { useMemo, useState } from 'react'
import { LineChart, Scale, HeartPulse } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { TrendChart } from './TrendChart'
import { healthMetricSeries } from '@/lib/charts/adapters'
import { buildLineSeries, type ChartRange, type SeriesPoint } from '@/lib/charts/series'
import { getHealthMetricLabel } from '@/lib/health-metrics/labels'
import { cn } from '@/lib/utils'
import type { HealthMetric, HealthMetricType } from '@/types'

// ─── Taxonomía por familia. El orden es el de las pills + el default (primera
//     disponible). Los tipos presentes NO mapeados caen a Cuerpo (no se pierden). ──
const CUERPO_TYPES: HealthMetricType[] = [
  'weight', 'body_fat_percent', 'skeletal_muscle_mass_kg', 'muscle_mass_kg', 'bmi',
  'visceral_fat_level', 'water_percent', 'protein_percent', 'bone_mass_kg',
  'metabolic_rate_kcal', 'metabolic_age', 'body_score', 'ideal_weight_kg',
]
const CORAZON_TYPES: HealthMetricType[] = [
  'hrv_avg', 'heart_rate', 'sleeping_heart_rate', 'heart_rate_min', 'heart_rate_max',
  'heart_rate_avg', 'hrv_min', 'hrv_max', 'blood_oxygen', 'respiratory_rate', 'blood_pressure',
]

interface Family {
  key: 'cuerpo' | 'corazon'
  title: string
  cadence: string
  icon: LucideIcon
  /** clase de color tailwind para la línea/acento (currentColor). */
  accent: string
  /** clases del pill activo. */
  pillActive: string
  order: HealthMetricType[]
}

const FAMILIES: Family[] = [
  {
    key: 'cuerpo', title: 'Cuerpo · Composición', cadence: 'tendencia lenta · semanas',
    icon: Scale, accent: 'text-brand',
    pillActive: 'border-brand/40 bg-brand/10 text-foreground font-medium',
    order: CUERPO_TYPES,
  },
  {
    key: 'corazon', title: 'Corazón · Cardiovascular', cadence: 'día a día · vs. tu baseline',
    icon: HeartPulse, accent: 'text-[#5b8cff]',
    pillActive: 'border-[#5b8cff]/50 bg-[#5b8cff]/10 text-foreground font-medium',
    order: CORAZON_TYPES,
  },
]

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ─── Rangos de referencia (para la banda + estado). Solo métricas con umbral
//     clínico claro; el resto va sin banda (solo tendencia). Fuentes: ACE (%grasa),
//     Tanita (grasa visceral), WHO (IMC), rangos vitales estándar. La VFC NO tiene
//     rango universal → se deriva del baseline personal de la propia serie. ──
type Tone = 'ok' | 'warn' | 'bad'
interface RefZone { from: number; to: number; tone: Tone }
interface RefInfo {
  scale: [number, number]
  zones: RefZone[]
  value: number
  status: Tone
  statusLabel: string
  scaleLabels: string[]
  caption: string
}

function evalReference(type: HealthMetricType, value: number, values: number[]): RefInfo | null {
  switch (type) {
    case 'body_fat_percent':
      return {
        scale: [5, 35],
        zones: [{ from: 5, to: 24, tone: 'ok' }, { from: 24, to: 30, tone: 'warn' }, { from: 30, to: 35, tone: 'bad' }],
        value, status: value <= 24 ? 'ok' : value < 28 ? 'warn' : 'bad',
        statusLabel: value <= 24 ? 'en rango' : value < 28 ? 'sobre tu zona' : 'alto',
        scaleLabels: ['14% fit', '18% ok', '25%+ alto'],
        caption: 'Zona fitness 14–17%, aceptable hasta 24% (hombres).',
      }
    case 'visceral_fat_level':
      return {
        scale: [1, 30],
        zones: [{ from: 1, to: 12, tone: 'ok' }, { from: 12, to: 20, tone: 'warn' }, { from: 20, to: 30, tone: 'bad' }],
        value, status: value <= 12 ? 'ok' : value <= 20 ? 'warn' : 'bad',
        statusLabel: value <= 12 ? 'sano' : value <= 20 ? 'elevado' : 'riesgo',
        scaleLabels: ['1', 'sano ≤12', '13+ exceso'],
        caption: 'La grasa peligrosa: sano hasta 12; 13+ es exceso.',
      }
    case 'bmi':
      return {
        scale: [15, 40],
        zones: [{ from: 15, to: 18.5, tone: 'warn' }, { from: 18.5, to: 25, tone: 'ok' }, { from: 25, to: 30, tone: 'warn' }, { from: 30, to: 40, tone: 'bad' }],
        value, status: value >= 18.5 && value < 25 ? 'ok' : value < 30 ? 'warn' : 'bad',
        statusLabel: value < 18.5 ? 'bajo' : value < 25 ? 'normal' : value < 30 ? 'sobrepeso' : 'obesidad',
        scaleLabels: ['18.5', '25', '30+'],
        caption: 'Sobrepeso ≥25 — pero el IMC no distingue músculo de grasa.',
      }
    case 'blood_oxygen':
      return {
        scale: [90, 100],
        zones: [{ from: 90, to: 95, tone: 'warn' }, { from: 95, to: 100, tone: 'ok' }],
        value, status: value >= 95 ? 'ok' : value >= 90 ? 'warn' : 'bad',
        statusLabel: value >= 95 ? 'normal' : 'bajo',
        scaleLabels: ['90', '95', '100'],
        caption: 'Oxígeno en sangre normal: 95–100%.',
      }
    case 'respiratory_rate':
      return {
        scale: [8, 25],
        zones: [{ from: 8, to: 12, tone: 'warn' }, { from: 12, to: 20, tone: 'ok' }, { from: 20, to: 25, tone: 'warn' }],
        value, status: value >= 12 && value <= 20 ? 'ok' : 'warn',
        statusLabel: value >= 12 && value <= 20 ? 'normal' : 'fuera',
        scaleLabels: ['12', '16', '20'],
        caption: 'Frecuencia respiratoria en reposo: 12–20 rpm.',
      }
    case 'heart_rate':
      return {
        scale: [40, 110],
        zones: [{ from: 40, to: 100, tone: 'ok' }, { from: 100, to: 110, tone: 'warn' }],
        value, status: value <= 100 ? 'ok' : 'warn',
        statusLabel: value < 60 ? 'fondo de atleta' : value <= 100 ? 'normal' : 'alto',
        scaleLabels: ['40', '60', '100'],
        caption: 'Reposo 60–100; bajo (<60) = buen acondicionamiento.',
      }
    case 'hrv_avg': {
      // VFC: sin rango universal → banda del baseline PERSONAL (media ±0.7·sd).
      if (values.length < 3) return null
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
      const lo = Math.max(0, mean - 0.7 * sd)
      const hi = mean + 0.7 * sd
      const scale: [number, number] = [Math.min(...values, lo) * 0.9, Math.max(...values, hi) * 1.08]
      return {
        scale, zones: [{ from: lo, to: hi, tone: 'ok' }],
        value, status: value >= lo ? 'ok' : 'warn',
        statusLabel: value >= lo ? 'dentro de tu rango' : 'bajo tu rango',
        scaleLabels: [`${Math.round(lo)}`, 'tu media', `${Math.round(hi)}`],
        caption: 'La VFC se lee vs. tu propio promedio (no una tabla).',
      }
    }
    default:
      return null
  }
}

const ZONE_BG: Record<Tone, string> = { ok: 'bg-ok/25', warn: 'bg-warn/25', bad: 'bg-bad/25' }
const PILL: Record<Tone, string> = { ok: 'text-ok bg-ok-soft', warn: 'text-warn bg-warn-soft', bad: 'text-bad bg-bad-soft' }

function pct(v: number, [min, max]: [number, number]): number {
  if (max <= min) return 0
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
}

function RangeBand({ ref }: { ref: RefInfo }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Rango saludable</span>
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', PILL[ref.status])}>
            {ref.statusLabel}
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-secondary overflow-hidden" aria-hidden="true">
          {ref.zones.map((z, i) => (
            <div
              key={i}
              className={cn('absolute inset-y-0', ZONE_BG[z.tone])}
              style={{ left: `${pct(z.from, ref.scale)}%`, width: `${pct(z.to, ref.scale) - pct(z.from, ref.scale)}%` }}
            />
          ))}
          <div
            className="absolute -top-0.5 h-3 w-[3px] rounded-sm bg-foreground ring-2 ring-card"
            style={{ left: `calc(${pct(ref.value, ref.scale)}% - 1.5px)` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] font-mono text-muted-foreground/70">
          {ref.scaleLabels.map((l, i) => (<span key={i}>{l}</span>))}
        </div>
        <p className="mt-2.5 text-[12px] text-muted-foreground leading-relaxed">{ref.caption}</p>
      </CardContent>
    </Card>
  )
}

interface BodyMetricsTrendProps {
  metrics: HealthMetric[]
  /** Modo controlled desde el padre (toggle global de /salud). */
  range?: ChartRange
  offset?: number
}

export function BodyMetricsTrend({ metrics, range, offset }: BodyMetricsTrendProps) {
  // Tipos presentes (excluye heart_rate_high_alerts, que es conteo episódico con
  // su propio panel HeartRateAlertsPanel).
  const presentTypes = useMemo(() => {
    const s = new Set<HealthMetricType>()
    for (const m of metrics) if (m.type !== 'heart_rate_high_alerts') s.add(m.type)
    return s
  }, [metrics])

  // Disponibles por familia (en orden de prioridad). Los presentes NO mapeados
  // en ninguna familia se anexan a Cuerpo para no perderlos.
  const byFamily = useMemo(() => {
    const mapped = new Set<HealthMetricType>([...CUERPO_TYPES, ...CORAZON_TYPES])
    const extras = [...presentTypes].filter((t) => !mapped.has(t))
    const cuerpo = [...CUERPO_TYPES.filter((t) => presentTypes.has(t)), ...extras]
    const corazon = CORAZON_TYPES.filter((t) => presentTypes.has(t))
    return { cuerpo, corazon }
  }, [presentTypes])

  if (byFamily.cuerpo.length === 0 && byFamily.corazon.length === 0) {
    return (
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <LineChart size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <h2 className="text-sm font-medium text-foreground">Tendencias de salud</h2>
          </div>
          <p className="text-sm text-muted-foreground py-2">
            Sin métricas todavía. Sube una captura de báscula o del anillo para ver las tendencias.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {FAMILIES.map((fam) => {
        const available = fam.key === 'cuerpo' ? byFamily.cuerpo : byFamily.corazon
        if (available.length === 0) return null
        return <FamilyTrend key={fam.key} family={fam} metrics={metrics} availableTypes={available} range={range} offset={offset} />
      })}
    </div>
  )
}

function FamilyTrend({
  family, metrics, availableTypes, range, offset,
}: {
  family: Family
  metrics: HealthMetric[]
  availableTypes: HealthMetricType[]
  range?: ChartRange
  offset?: number
}) {
  const [selected, setSelected] = useState<HealthMetricType>(availableTypes[0])
  const active = availableTypes.includes(selected) ? selected : availableTypes[0]

  const series = useMemo(() => healthMetricSeries(metrics, active), [metrics, active])
  const [shown, setShown] = useState<SeriesPoint[]>([])
  const statsPts = shown.length > 0 ? shown : series
  const geo = useMemo(() => buildLineSeries(statsPts), [statsPts])

  const unit = useMemo(() => {
    const ofType = metrics.filter((m) => m.type === active)
    return ofType.length ? ofType[ofType.length - 1].unit : ''
  }, [metrics, active])

  const fmt = (n: number) => {
    const v = String(round1(n))
    if (!unit) return v
    return unit === '%' ? `${v}%` : `${v} ${unit}`
  }

  // Banda de referencia para el valor MÁS RECIENTE del tipo activo.
  const refInfo = useMemo(() => {
    if (series.length === 0) return null
    const latest = series[series.length - 1].value
    return evalReference(active, latest, series.map((p) => p.value))
  }, [active, series])

  const Icon = family.icon
  const enoughData = series.length >= 2
  const avg = statsPts.length ? statsPts.reduce((acc, p) => acc + p.value, 0) / statsPts.length : 0

  return (
    <div className="space-y-3">
      {/* Selector + header de la familia. */}
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-secondary', family.accent)}>
              <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <h2 className="text-sm font-semibold text-foreground">{family.title}</h2>
              <p className="text-[11px] text-muted-foreground">{family.cadence}</p>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label={family.title}>
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
                    ? family.pillActive
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
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
            {series.length === 1 && refInfo ? (
              <>
                <p className="text-sm text-muted-foreground pb-3">
                  1 registro de {getHealthMetricLabel(active)} ({fmt(series[0].value)}). Con 2+ capturas verás la tendencia.
                </p>
                <RangeBand ref={refInfo} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                {series.length === 1
                  ? `Solo 1 registro de ${getHealthMetricLabel(active)} (${fmt(series[0].value)}). Necesitas 2+ capturas para ver la tendencia.`
                  : `Sin registros de ${getHealthMetricLabel(active)} todavía.`}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <TrendChart
            label={getHealthMetricLabel(active)}
            icon={family.icon}
            points={series}
            colorClass={family.accent}
            formatValue={fmt}
            height={120}
            windowable
            defaultRange="mes"
            range={range}
            offset={offset}
            onShownChange={setShown}
          />

          {refInfo && <RangeBand ref={refInfo} />}

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{label}</div>
      <div className="text-base sm:text-lg font-mono font-semibold tabular-nums">{value}</div>
    </div>
  )
}
