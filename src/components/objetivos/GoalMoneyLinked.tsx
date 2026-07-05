'use client'

// SIR V2 — Dinero real vinculado a un objetivo (rescate de finance_movements.
// related_goal). Muestra cuánto llevás INVERTIDO (gasto/inversión/deuda) o
// generado como INGRESO hacia este objetivo, desde los movimientos de /finanzas.
// Invisible si no hay ninguno vinculado. Complementa a GoalCosts (presupuesto
// planeado) con la plata que de verdad se movió.
import { useMemo } from 'react'
import { Coins } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { moneyForGoal } from '@/lib/finance/byGoal'
import { formatPEN } from '@/lib/format/currency'

export function GoalMoneyLinked({ goalId }: { goalId: string }) {
  const movements = useFinanceStore((s) => s.financialMovements)
  const money = useMemo(() => moneyForGoal(movements, goalId), [movements, goalId])

  if (!money || money.count === 0) return null

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <Coins size={15} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Dinero vinculado a este objetivo</div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {money.investedPEN > 0 && (
            <div>
              <div className="text-lg font-semibold tabular-nums text-foreground">{formatPEN(money.investedPEN)}</div>
              <div className="text-[11px] text-muted-foreground">invertido / gastado</div>
            </div>
          )}
          {money.earnedPEN > 0 && (
            <div>
              <div className="text-lg font-semibold tabular-nums" style={{ color: '#2dd4a7' }}>{formatPEN(money.earnedPEN)}</div>
              <div className="text-[11px] text-muted-foreground">ingresos atribuidos</div>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-2">
          De {money.count} movimiento{money.count === 1 ? '' : 's'} que vinculaste en Finanzas.
        </p>
      </CardContent>
    </Card>
  )
}
