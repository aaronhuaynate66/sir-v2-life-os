// SIR V2 — Desglose del gasto por intención (P1).
// Overview que muestra cuánto se fue en obligatorio / necesario / no-esencial,
// con barra proporcional + montos + %. Empuja a clasificar lo no-clasificado.
'use client'

import { PieChart } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { formatPEN } from '@/lib/format/currency'
import type { SpendingByIntent } from '@/engines/financial'
import { INTENT_LABEL, INTENT_TEXT, INTENT_BAR } from '@/lib/finanzas/intent-meta'
import { cn } from '@/lib/utils'

const cardClass = 'shadow-none transition-colors duration-200 hover:border-primary/30'

export function SpendIntentBreakdown({ data }: { data: SpendingByIntent }) {
  const { items, classifiedPEN, unclassifiedPEN, unclassifiedCount } = data
  const hasData = classifiedPEN > 0

  return (
    <Card className={cn('mb-4', cardClass)}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={PieChart} label="Gasto por intención" />

        {!hasData ? (
          <div className="text-center py-6">
            <PieChart size={22} strokeWidth={1.5} className="text-muted-foreground/40 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Sin gastos clasificados todavía.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Al registrar un gasto, elegí su intención (obligatorio / necesario / no esencial)
              para ver el desglose.
            </p>
          </div>
        ) : (
          <>
            {/* Barra proporcional apilada. */}
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted mb-4" role="img" aria-label="Proporción de gasto por intención">
              {items.map((it) =>
                it.pct > 0 ? (
                  <div
                    key={it.intent}
                    className={cn('h-full', INTENT_BAR[it.intent])}
                    style={{ width: `${it.pct}%` }}
                    title={`${INTENT_LABEL[it.intent]}: ${it.pct}%`}
                  />
                ) : null,
              )}
            </div>

            {/* Detalle por intención. */}
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.intent} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', INTENT_BAR[it.intent])} aria-hidden="true" />
                    <span className="text-sm text-foreground/90 truncate">{INTENT_LABEL[it.intent]}</span>
                    <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">
                      {it.count > 0 ? `${it.count}×` : ''}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 flex-shrink-0">
                    <span className={cn('text-sm font-mono tabular-nums', INTENT_TEXT[it.intent])}>
                      {formatPEN(it.totalPEN)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums w-9 text-right">
                      {it.pct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Total clasificado</span>
              <span className="text-sm font-mono tabular-nums text-foreground">{formatPEN(classifiedPEN)}</span>
            </div>

            {unclassifiedCount > 0 && (
              <p className="text-[10px] text-muted-foreground/60 mt-2">
                {unclassifiedCount} salida{unclassifiedCount === 1 ? '' : 's'} sin clasificar ({formatPEN(unclassifiedPEN)}).
                Asigná intención al registrar para incluirlas.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
