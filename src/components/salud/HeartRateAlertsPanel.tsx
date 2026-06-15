// SIR V2 — Panel "Alertas de FC elevada" (#90 Fase 1).
// Lista los DÍAS en que el wearable registró alertas de frecuencia cardíaca
// elevada (métrica heart_rate_high_alerts). Señal episódica de activación.
// La alerta del wearable salta con FC elevada sostenida ~10 min EN REPOSO
// (descarta esfuerzo). Es activación real — probablemente estrés, pero también
// cafeína/sueño/deshidratación/enfermedad. Es para mirar patrones, no diagnosticar.

'use client'

import { useMemo } from 'react'
import { HeartPulse, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import type { HealthMetric } from '@/types'

interface Props {
  metrics: HealthMetric[]
}

function fmtDay(iso: string): string {
  // timestamp es 'YYYY-MM-DDT12:00:00.000Z' → tomamos la fecha local del día.
  const d = iso.slice(0, 10)
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}

export function HeartRateAlertsPanel({ metrics }: Props) {
  const alerts = useMemo(
    () =>
      metrics
        .filter((m) => m.type === 'heart_rate_high_alerts')
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [metrics],
  )

  const totalDays = alerts.length
  const totalAlerts = alerts.reduce((acc, a) => acc + (Number(a.value) || 0), 0)

  if (totalDays === 0) return null

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.03]">
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={HeartPulse} label="Alertas de FC elevada" count={totalDays} />
        <p className="mt-1 text-[12px] text-muted-foreground">
          {totalDays} día(s) con alertas · {totalAlerts} alerta(s) en total. El reloj las marca solo con
          FC elevada sostenida ~10 min en reposo, así que descarta el ejercicio. Es activación real:
          lo más probable es estrés, aunque también la disparan cafeína, dormir poco, deshidratación o
          estar incubando algo.
        </p>
        <ul className="mt-3 space-y-1.5">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-[13px]">
              <span className="flex items-center gap-2 text-foreground">
                <AlertTriangle size={13} className="text-amber-400" />
                {fmtDay(a.timestamp)}
              </span>
              <span className="text-muted-foreground">{Number(a.value)} alerta(s)</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
