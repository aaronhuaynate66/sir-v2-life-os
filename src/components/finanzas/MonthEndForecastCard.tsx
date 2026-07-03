// SIR V2 — Proyección de fin de mes (gasto). Consume projectMonthEndSpend (puro).
// Presentacional: recibe el forecast ya calculado. Honesto con 'insufficient'.

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { Badge } from '@/components/ui/badge'
import { formatPEN } from '@/lib/format/currency'
import { cn } from '@/lib/utils'
import type { MonthEndSpendForecast, ForecastConfidence } from '@/lib/forecast/monthEnd'

const CONFIDENCE_LABEL: Record<ForecastConfidence, string> = { low: 'baja', medium: 'media', high: 'alta' }

const cardClass = 'transition-colors duration-200 hover:border-border-strong'

export function MonthEndForecastCard({ forecast }: { forecast: MonthEndSpendForecast }) {
  const f = forecast

  if (f.status === 'insufficient') {
    return (
      <Card className={cn('mb-4', cardClass)}>
        <CardContent className="p-4 sm:p-6">
          <SectionTitle icon={TrendingUp} label={`Proyección de ${f.monthLabel}`} />
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">{f.reason}</p>
          {f.mtdOutflowPEN > 0 && (
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Vas en {formatPEN(f.mtdOutflowPEN)} de gasto con {f.daysElapsed} día{f.daysElapsed === 1 ? '' : 's'}.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // Comparación vs mes pasado: gastar MÁS es bad, MENOS es ok.
  const over = f.vsLastMonthPct != null && f.vsLastMonthPct > 0
  const cmpTone = f.vsLastMonthPct == null ? 'muted' : over ? 'bad' : 'ok'
  const CmpIcon = f.vsLastMonthPct == null ? Minus : over ? TrendingUp : TrendingDown

  return (
    <Card className={cn('mb-4', cardClass)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SectionTitle icon={TrendingUp} label={`Proyección de ${f.monthLabel}`} />
          <Badge variant="secondary" className="text-[10px] font-mono">confianza {CONFIDENCE_LABEL[f.confidence]}</Badge>
        </div>

        <div className="mt-2 flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-foreground">
              {formatPEN(f.projectedOutflowPEN)}
            </div>
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mt-0.5">
              gasto proyectado de {f.monthLabel}
            </div>
          </div>

          {f.vsLastMonthPct != null && (
            <div className={cn('flex items-center gap-1 text-xs font-medium mb-1', cmpTone === 'bad' ? 'text-bad' : cmpTone === 'ok' ? 'text-ok' : 'text-muted-foreground')}>
              <CmpIcon size={14} strokeWidth={2} />
              {f.vsLastMonthPct > 0 ? '+' : ''}{f.vsLastMonthPct}% vs mes pasado
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mt-3">
          Vas en <span className="text-foreground font-medium">{formatPEN(f.mtdOutflowPEN)}</span> con {f.daysElapsed} de {f.daysInMonth} días
          {' · '}ritmo variable <span className="text-foreground font-medium">{formatPEN(f.dailyVariablePEN)}/día</span>
          {' · '}{f.daysRemaining} por delante.
          {f.mtdRecurringPEN > 0 && (
            <> Incluye <span className="text-foreground font-medium">{formatPEN(f.mtdRecurringPEN)}</span> de gasto fijo (no se re-proyecta).</>
          )}
        </p>
        {f.lastMonthOutflowPEN != null && (
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            Mes pasado gastaste {formatPEN(f.lastMonthOutflowPEN)} en total.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
