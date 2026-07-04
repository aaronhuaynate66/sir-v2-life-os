'use client'

// SIR V2 — SleepDebtCard (11·M1): deuda de sueño ACUMULADA (no promedio).
// Corre el motor puro `accumulatedSleepDebt` sobre tus noches y muestra la deuda
// real + cuántas noches en rango para volver a base. Honesto: si hay poca
// cobertura reciente, lo dice en vez de afirmar. Se oculta sin datos.

import { useMemo } from 'react'
import { Moon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { accumulatedSleepDebt } from '@/lib/sleep/debt'
import { cn } from '@/lib/utils'

export function SleepDebtCard() {
  const { sleepRecords } = useSelfStore()
  const debt = useMemo(
    () => accumulatedSleepDebt(sleepRecords.map((s) => ({ date: s.date, duration: s.duration })), Date.now()),
    [sleepRecords],
  )

  if (sleepRecords.length === 0) return null

  const hasDebt = debt.debtHours > 0
  const tone = !debt.sufficient ? 'text-muted-foreground' : hasDebt ? (debt.debtHours >= 5 ? 'text-bad' : 'text-warn') : 'text-ok'

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <Moon size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Deuda de sueño (acumulada)</h2>
        </div>

        <div className={cn('text-2xl font-mono font-bold tabular-nums', tone)}>
          {debt.debtHours}<span className="text-sm text-muted-foreground/50">h</span>
        </div>

        <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">
          {!debt.sufficient
            ? `Poca cobertura reciente (${debt.recentCoverage}/7 noches) — es una estimación floja. Registrá tus noches para afinarla.`
            : hasDebt
              ? `Se acumuló noche a noche. A este ritmo, ~${debt.nightsToBase} noche${debt.nightsToBase === 1 ? '' : 's'} durmiendo bien para volver a base. Una noche larga suelta paga solo una parte.`
              : 'Al día — sin deuda acumulada. Buen ritmo.'}
        </p>
      </CardContent>
    </Card>
  )
}
