'use client'

// SIR V2 — TwoProcessCard (11·M6, EXPERIMENTAL): modelo de fase acoplado S×C.
// Estima tu energía a una hora combinando el ritmo circadiano (ajustado a tu
// curva) y la deuda de sueño. SOMBRA: solo se muestra si el backtest (MAE contra
// lo observado) valida; si no, se oculta. Siempre rotulado experimental.

import { useMemo } from 'react'
import { FlaskConical } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { computeEnergyCurve } from '@/lib/chrono/energyCurve'
import { fitTwoProcess, predictEnergy, backtestTwoProcess } from '@/lib/chrono/twoProcess'
import { accumulatedSleepDebt } from '@/lib/sleep/debt'

export function TwoProcessCard() {
  const { selfMetrics, sleepRecords } = useSelfStore()

  const view = useMemo(() => {
    const curve = computeEnergyCurve(selfMetrics.filter((m) => m.category === 'energy').map((m) => ({ value: m.value, timestamp: m.timestamp })))
    const model = fitTwoProcess(curve)
    if (!model) return null
    const bt = backtestTwoProcess(model, curve)
    if (!bt.validated) return null // sombra: no exponer sin backtest

    const debt = accumulatedSleepDebt(sleepRecords.map((s) => ({ date: s.date, duration: s.duration })), Date.now())
    const limaHour = new Date(Date.now() - 5 * 3_600_000).getUTCHours()
    return { hour: limaHour, pred: predictEnergy(model, limaHour, debt.debtHours), mae: bt.mae }
  }, [selfMetrics, sleepRecords])

  if (!view) return null

  return (
    <Card className="shadow-none mb-4 border-dashed">
      <CardContent className="p-4 sm:p-5 space-y-1.5">
        <div className="flex items-center gap-2">
          <FlaskConical size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Modelo de energía · experimental</h2>
        </div>
        <p className="text-[13px] text-foreground/90 leading-relaxed">
          A esta hora (~{view.hour}h) el modelo estima tu energía en <span className="font-mono text-foreground">{view.pred}/10</span>,
          combinando tu ritmo del día y la deuda de sueño.
        </p>
        <div className="text-[10px] text-muted-foreground/60">experimental · ajuste in-sample (error medio {view.mae}/10) · se afina con datos</div>
      </CardContent>
    </Card>
  )
}
