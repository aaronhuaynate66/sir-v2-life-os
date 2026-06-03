'use client'
// SIR V2 — TrackerDetail: detalle de un tracker en el tablero.
// Gráfico de la serie (TrendChart reusado) + condición/estado + histórico de
// puntos + form de captura (multi-imagen/texto) + borrar puntos / el tracker.

import { LineChart, Target, Trash2, CheckCircle2, AlertTriangle, Activity, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SectionTitle } from '@/components/ui/section-title'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { TrendChart } from '@/components/charts/TrendChart'
import { useTrackerStore } from '@/stores/useTrackerStore'
import {
  conditionLabel,
  formatTrackerValue,
  statusLabel,
  trackerStatus,
  type TrackerStatus,
} from '@/lib/trackers/evaluate'
import { pointsForTracker, toSeries } from '@/lib/trackers/points'
import type { Tracker } from '@/types'
import { cn } from '@/lib/utils'
import { TrackerCaptureForm } from './TrackerCaptureForm'

const STATUS_META: Record<TrackerStatus, { Icon: LucideIcon; cls: string; colorClass: string }> = {
  met: { Icon: CheckCircle2, cls: 'border-ok/30 bg-ok-soft text-ok', colorClass: 'text-ok' },
  stale: { Icon: AlertTriangle, cls: 'border-warn/30 bg-warn-soft text-warn', colorClass: 'text-warn' },
  tracking: { Icon: Activity, cls: 'border-brand/30 bg-brand-soft text-brand-soft-foreground', colorClass: 'text-brand' },
  no_data: { Icon: Minus, cls: 'border-border bg-muted text-muted-foreground', colorClass: 'text-muted-foreground' },
}

const SOURCE_LABEL: Record<string, string> = {
  manual_screenshot: 'captura',
  manual_text: 'texto',
  email: 'email',
}

export interface TrackerDetailProps {
  tracker: Tracker
  now?: Date
  className?: string
}

export function TrackerDetail({ tracker, now = new Date(), className }: TrackerDetailProps) {
  const allPoints = useTrackerStore((s) => s.points)
  const removePoint = useTrackerStore((s) => s.removePoint)

  const series = toSeries(allPoints, tracker.id)
  const history = pointsForTracker(allPoints, tracker.id).slice().reverse() // más reciente arriba
  const status = trackerStatus(tracker, now)
  const meta = STATUS_META[status]

  return (
    <div className={cn('space-y-4', className)}>
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{tracker.label}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className={cn('text-[10px] font-normal', meta.cls)}>
                  <meta.Icon size={11} strokeWidth={2} className="mr-1" aria-hidden="true" />
                  {statusLabel(status)}
                </Badge>
                <Badge variant="outline" className="text-[10px] font-normal">
                  <Target size={11} strokeWidth={2} className="mr-1" aria-hidden="true" />
                  {conditionLabel(tracker)}
                </Badge>
                {tracker.cadenceDays ? (
                  <Badge variant="outline" className="text-[10px] font-normal">cada {tracker.cadenceDays} d</Badge>
                ) : null}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-semibold tabular-nums">
                {formatTrackerValue(tracker.currentValue, tracker.unit)}
              </div>
              {tracker.currentValueDate && (
                <div className="text-[10px] font-mono text-muted-foreground/60">{tracker.currentValueDate}</div>
              )}
            </div>
          </div>

          <TrendChart
            label="Serie"
            icon={LineChart}
            points={series}
            colorClass={meta.colorClass}
            formatValue={(n) => formatTrackerValue(n, tracker.unit)}
            emptyHint="Sin puntos todavía. Agregá uno abajo (captura o texto)."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <SectionTitle icon={LineChart} label="Agregar lectura" />
          <div className="mt-3">
            <TrackerCaptureForm tracker={tracker} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <SectionTitle icon={Activity} label="Histórico" count={history.length || undefined} />
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Sin puntos.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {history.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums font-semibold">
                      {formatTrackerValue(p.value, tracker.unit)}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground/60">{p.date}</span>
                    <Badge variant="outline" className="text-[10px] font-normal">{SOURCE_LABEL[p.source] ?? p.source}</Badge>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="hover:text-bad" aria-label="Eliminar punto">
                        <Trash2 size={13} strokeWidth={1.75} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar este punto?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {formatTrackerValue(p.value, tracker.unit)} del {p.date}. Se recalculará el último valor.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removePoint(p.id)} className="bg-bad text-white hover:bg-bad/90">
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
          {p_note(history)}
        </CardContent>
      </Card>
    </div>
  )
}

/** Muestra la nota del punto más reciente, si tiene (observaciones de Vision). */
function p_note(history: ReturnType<typeof pointsForTracker>) {
  const note = history.find((p) => p.note)?.note
  if (!note) return null
  return <p className="mt-3 text-[11px] text-muted-foreground/70 italic">Última nota: {note}</p>
}
