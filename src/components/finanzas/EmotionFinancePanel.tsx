// SIR V2 — Correlación emocional ↔ financiera (P3).
// Muestra si el gasto no-esencial sube con el estrés ("gasto hormiga").
// Determinístico (engine puro). Honesto: si no hay data o no hay patrón, lo
// dice; nunca afirma causa.
'use client'

import { Activity, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { formatPEN } from '@/lib/format/currency'
import type { EmotionFinanceCorrelation, StressLevel } from '@/lib/longitudinal/emotionFinance'
import { cn } from '@/lib/utils'

const cardClass = 'shadow-none transition-colors duration-200 hover:border-primary/30'

const LEVEL_BAR: Record<StressLevel, string> = {
  low: 'bg-emerald-400',
  medium: 'bg-amber-400',
  high: 'bg-red-400',
}
const LEVEL_TEXT: Record<StressLevel, string> = {
  low: 'text-emerald-400',
  medium: 'text-amber-400',
  high: 'text-red-400',
}

export function EmotionFinancePanel({ data }: { data: EmotionFinanceCorrelation }) {
  const { buckets, totalDays, hasPattern, insight, status } = data

  return (
    <Card className={cn('mb-4', cardClass)}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Activity} label="Estrés y gasto" />

        {status === 'insufficient_data' ? (
          <div className="text-center py-6">
            <Activity size={22} strokeWidth={1.5} className="text-muted-foreground/40 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Aún no hay suficientes días para ver una relación.</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-md mx-auto leading-snug">
              Registrá tu estrés en <span className="font-mono text-foreground/80">/yo</span> y clasificá tus
              gastos por intención acá. {totalDays > 0 ? `Llevás ${totalDays} día${totalDays === 1 ? '' : 's'} con estrés registrado.` : ''}
            </p>
          </div>
        ) : (
          <>
            {hasPattern && insight ? (
              <div className="flex items-start gap-2 mb-4 p-3 rounded border border-amber-500/30 bg-amber-500/10">
                <TrendingUp size={15} strokeWidth={1.75} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-foreground/90 leading-relaxed">{insight}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                No se observa una relación clara entre tu estrés y tu gasto no-esencial. Buena señal.
              </p>
            )}

            {/* Buckets: gasto no-esencial promedio por nivel de estrés. */}
            <BucketBars data={data} />

            <p className="text-[10px] text-muted-foreground/60 mt-3 pt-3 border-t border-border/40 leading-snug">
              Correlación, no causa. Es una observación para reflexionar — sobre {totalDays} días con estrés registrado.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BucketBars({ data }: { data: EmotionFinanceCorrelation }) {
  const withAvg = data.buckets.filter((b) => b.avgNonEssentialPEN != null)
  const maxAvg = Math.max(1, ...withAvg.map((b) => b.avgNonEssentialPEN!))

  return (
    <div className="space-y-2.5">
      {data.buckets.map((b) => {
        const avg = b.avgNonEssentialPEN
        const pct = avg != null ? Math.round((avg / maxAvg) * 100) : 0
        return (
          <div key={b.level}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', LEVEL_BAR[b.level])} aria-hidden="true" />
                <span className="text-sm text-foreground/90">{b.label}</span>
                <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">
                  {b.dayCount} día{b.dayCount === 1 ? '' : 's'}
                </span>
              </div>
              <span className={cn('text-sm font-mono tabular-nums flex-shrink-0', avg != null ? LEVEL_TEXT[b.level] : 'text-muted-foreground/40')}>
                {avg != null ? `${formatPEN(avg)}/día` : 'pocos datos'}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              {avg != null && (
                <div className={cn('h-full rounded-full', LEVEL_BAR[b.level])} style={{ width: `${pct}%` }} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
