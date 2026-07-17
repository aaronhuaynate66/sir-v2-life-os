'use client'

// SIR V2 — AnomaliesCard (AF·F3): "cosas que no te cuadran".
// Corre el motor puro `detectAnomalies` sobre tu propia data (finanzas, ánimo,
// sueño) y muestra lo que se sale de tu patrón. Auto-forense (Pathfinder sano):
// para verte, no vigilar. Se oculta si no hay anomalías.

import { useMemo } from 'react'
import { SearchCheck, DollarSign, Activity, Moon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { detectAnomalies, type AnomalySource, type AnomalySeverity } from '@/lib/anomaly/detect'
import { cn } from '@/lib/utils'

const SRC_ICON: Record<AnomalySource, typeof DollarSign> = { finanzas: DollarSign, animo: Activity, sueno: Moon, salud: Activity }
const SEV_DOT: Record<AnomalySeverity, string> = { alta: 'bg-bad', media: 'bg-warn' }

export function AnomaliesCard() {
  const { selfMetrics, sleepRecords } = useSelfStore()
  const { financialMovements } = useFinanceStore()

  const anomalies = useMemo(
    () => detectAnomalies({
      finance: financialMovements.map((m) => ({ id: m.id, amountPEN: m.amountPEN, date: m.date, type: m.type, description: m.description })),
      metrics: selfMetrics.map((s) => ({ id: s.id, category: s.category, value: s.value, timestamp: s.timestamp })),
      sleep: sleepRecords.map((s) => ({ id: s.id, duration: s.duration, date: s.date })),
    }, Date.now()),
    [financialMovements, selfMetrics, sleepRecords],
  )

  if (anomalies.length === 0) return null

  return (
    <Card className="shadow-none mb-5 border-warn/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <SearchCheck size={14} strokeWidth={1.75} className="text-warn" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Cosas que no te cuadran</h2>
          <span className="text-[10px] text-muted-foreground/50 ml-auto">{anomalies.length}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
          Lo que se sale de tu patrón — <span className="font-medium text-foreground/80">mira si tiene sentido</span>. No es alarma ni veredicto.
        </p>
        <ul className="space-y-2.5">
          {anomalies.map((a) => {
            const Icon = SRC_ICON[a.source]
            return (
              <li key={a.id} className="flex items-start gap-3">
                <span className={cn('mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0', SEV_DOT[a.severity])} aria-hidden="true" />
                <Icon size={13} strokeWidth={1.75} className="text-muted-foreground/70 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[13px] text-foreground">{a.title}</span>
                    <span className="text-[10px] text-muted-foreground/50 font-mono">{a.date}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{a.detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
