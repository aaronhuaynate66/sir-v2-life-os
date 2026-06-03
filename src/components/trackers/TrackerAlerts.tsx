'use client'
// SIR V2 — TrackerAlerts: alertas vivas de trackers (condición cumplida o
// desactualizado), derivadas en vivo del store (no duplican en signals). Se usa
// en el tablero /seguimiento y como tira compacta en /señales. Cada alerta
// linkea al detalle del tracker.

import Link from 'next/link'
import { CheckCircle2, AlertTriangle, Bell } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { useTrackerStore } from '@/stores/useTrackerStore'
import { buildTrackerAlerts } from '@/lib/trackers/notify'
import { cn } from '@/lib/utils'

export interface TrackerAlertsProps {
  now?: Date
  /** Título de sección (default "Alertas de seguimiento"). */
  title?: string
  /** Si no hay alertas, no renderiza nada (default true). */
  hideWhenEmpty?: boolean
  className?: string
}

export function TrackerAlerts({
  now = new Date(),
  title = 'Alertas de seguimiento',
  hideWhenEmpty = true,
  className,
}: TrackerAlertsProps) {
  const trackers = useTrackerStore((s) => s.trackers)
  const alerts = buildTrackerAlerts(trackers, now)

  if (alerts.length === 0 && hideWhenEmpty) return null

  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Bell} label={title} count={alerts.length || undefined} />
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Sin alertas activas.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {alerts.map((a) => {
              const isMet = a.kind === 'met'
              const Icon = isMet ? CheckCircle2 : AlertTriangle
              return (
                <li key={a.tracker.id}>
                  <Link
                    href={a.href}
                    className={cn(
                      'flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:border-border-strong',
                      isMet ? 'border-ok/30 bg-ok-soft' : 'border-warn/30 bg-warn-soft',
                    )}
                  >
                    <Icon
                      size={15}
                      strokeWidth={1.75}
                      className={cn('mt-0.5 flex-shrink-0', isMet ? 'text-ok' : 'text-warn')}
                      aria-hidden="true"
                    />
                    <span className="text-foreground">{a.message}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
