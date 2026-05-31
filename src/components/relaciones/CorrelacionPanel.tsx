'use client'
// SIR V2 — CorrelacionPanel (Fase 3c: vista de correlación longitudinal).
//
// Cruza los person_logs (ánimo/energía/sueño/dolor, 1-5) contra la fase
// lunar y la fase del ciclo, y muestra los promedios por fase + el delta
// notable. 100% determinístico (correlation.ts) — NO usa OpenAI. Una capa
// narrativa OPCIONAL (Anthropic) vive detrás de un botón.
//
// INVARIANTES (#1 bienestar, #5 correlación ≠ causa): copy sobrio,
// "promedio" no "causa"; empty state honesto si no hay data suficiente.
//
// No depende de Date.now() (la fase se computa de la FECHA de cada log) →
// seguro de computar en render, sin mismatch de hidratación.

import { useCallback, useState } from 'react'
import { LineChart, Sparkles, Loader2, Moon, Activity } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SectionTitle } from '@/components/ui/section-title'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { toApiError, parseErrorResponse, type ApiError } from '@/lib/api/errors'
import {
  correlateByLunarPhase,
  correlateByCyclePhase,
  type MetricByPhase,
} from '@/lib/longitudinal/correlation'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import { cn } from '@/lib/utils'

export interface CorrelacionPanelProps {
  personId: string
  personLogs: PersonLog[]
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
}

const KIND_LABEL: Record<PersonLogKind, string> = {
  mood: 'Ánimo',
  energy: 'Energía',
  sleep: 'Sueño',
  pain: 'Dolor',
  interaction: 'Interacción',
}

const KIND_BAR: Record<PersonLogKind, string> = {
  mood: 'bg-amber-400',
  energy: 'bg-emerald-400',
  sleep: 'bg-sky-400',
  pain: 'bg-red-400',
  interaction: 'bg-violet-400',
}

export function CorrelacionPanel({
  personId,
  personLogs,
  cycleStartDate,
  cycleLengthDays,
}: CorrelacionPanelProps) {
  const lunar = correlateByLunarPhase(personLogs)
  const cycle = correlateByCyclePhase(personLogs, cycleStartDate, cycleLengthDays)

  const hasData = lunar.length > 0 || cycle.length > 0

  const [narrative, setNarrative] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const onNarrate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/longitudinal/correlation-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId }),
      })
      if (!res.ok) {
        setError(await parseErrorResponse(res))
        return
      }
      const data = (await res.json()) as { narrative?: string }
      setNarrative(data.narrative ?? '')
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setLoading(false)
    }
  }, [personId])

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={LineChart} label="Correlación longitudinal" />

        {!hasData ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {lunar.length > 0 && (
              <PhaseGroup
                icon={<Moon size={13} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />}
                title="Por fase lunar"
                metrics={lunar}
              />
            )}
            {cycle.length > 0 && (
              <PhaseGroup
                icon={<Activity size={13} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />}
                title="Por fase del ciclo"
                metrics={cycle}
              />
            )}

            <p className="text-[11px] text-muted-foreground/70 leading-relaxed border-t border-border/40 pt-3">
              Promedios sobre tus registros. Correlación, no causa — describe
              coincidencias, no efectos.
            </p>

            {/* Capa narrativa OPCIONAL (Anthropic), detrás del botón. */}
            <div className="space-y-2">
              {narrative ? (
                <p className="text-sm text-foreground/90 leading-relaxed border-l-2 border-primary/40 pl-3">
                  {narrative}
                </p>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNarrate}
                  disabled={loading}
                  className="text-xs"
                >
                  {loading ? (
                    <Loader2 size={13} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
                  )}
                  {loading ? 'Generando…' : 'Lectura en prosa (IA)'}
                </Button>
              )}
              {error && <ApiErrorNotice error={error} />}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PhaseGroup({
  icon,
  title,
  metrics,
}: {
  icon: React.ReactNode
  title: string
  metrics: MetricByPhase[]
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      {metrics.map((m) => (
        <MetricRow key={m.kind} metric={m} />
      ))}
    </div>
  )
}

function MetricRow({ metric }: { metric: MetricByPhase }) {
  const withData = metric.buckets.filter((b) => b.average != null)
  const barColor = KIND_BAR[metric.kind]

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{KIND_LABEL[metric.kind]}</span>
        <span className="text-[10px] font-mono text-muted-foreground/60">
          {metric.totalSamples} {metric.totalSamples === 1 ? 'registro' : 'registros'}
        </span>
      </div>

      <div className="space-y-1">
        {withData.map((b) => (
          <div key={b.phaseId} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-32 shrink-0 truncate">{b.label}</span>
            <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={cn('h-full rounded-full', barColor)}
                style={{ width: `${((b.average ?? 0) / 5) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-mono tabular-nums text-foreground w-7 text-right shrink-0">
              {b.average?.toFixed(1)}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/50 w-9 shrink-0">
              n={b.count}
            </span>
          </div>
        ))}
      </div>

      {metric.delta && (
        <Badge variant="outline" className="text-[10px] font-normal mt-1">
          {metric.delta.high.label} {metric.delta.high.average} vs {metric.delta.low.label}{' '}
          {metric.delta.low.average} · Δ {metric.delta.diff}
        </Badge>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground space-y-2">
      <p>Sin patrones todavía.</p>
      <p className="text-xs leading-relaxed">
        Necesitamos varios registros de <span className="text-foreground/80">ánimo</span>,{' '}
        <span className="text-foreground/80">energía</span>,{' '}
        <span className="text-foreground/80">sueño</span> o{' '}
        <span className="text-foreground/80">dolor</span> en distintos días para
        empezar a cruzarlos con la fase lunar y la del ciclo. Registralos arriba en
        “Registro rápido”. No inventamos patrones sobre poca data.
      </p>
    </div>
  )
}
