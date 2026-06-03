'use client'
// SIR V2 — TrackerSummary: resumen compacto de un tracker, para mostrar EN el
// item enganchado (tarea/KR/objetivo). Último valor + flecha de tendencia +
// estado vs condición. Toca → deep-link al detalle en el tablero (/seguimiento).

import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Tracker, TrackerPoint } from '@/types'
import {
  computeTrend,
  conditionLabel,
  formatTrackerValue,
  statusLabel,
  trackerStatus,
  type TrackerStatus,
} from '@/lib/trackers/evaluate'
import { trackerHref } from '@/lib/trackers/notify'
import { cn } from '@/lib/utils'

const STATUS_META: Record<TrackerStatus, { Icon: LucideIcon; cls: string }> = {
  met: { Icon: CheckCircle2, cls: 'border-ok/30 bg-ok-soft text-ok' },
  stale: { Icon: AlertTriangle, cls: 'border-warn/30 bg-warn-soft text-warn' },
  tracking: { Icon: Activity, cls: 'border-brand/30 bg-brand-soft text-brand-soft-foreground' },
  no_data: { Icon: Minus, cls: 'border-border bg-muted text-muted-foreground' },
}

export interface TrackerSummaryProps {
  tracker: Tracker
  points: TrackerPoint[]
  now?: Date
  className?: string
}

export function TrackerSummary({ tracker, points, now = new Date(), className }: TrackerSummaryProps) {
  const status = trackerStatus(tracker, now)
  const trend = computeTrend(points, tracker.conditionKind)
  const meta = STATUS_META[status]

  const TrendIcon: LucideIcon =
    trend.direction == null || trend.direction === 'flat'
      ? Minus
      : trend.direction === 'up'
        ? TrendingUp
        : TrendingDown
  const trendCls =
    trend.favorable == null ? 'text-muted-foreground' : trend.favorable ? 'text-ok' : 'text-bad'

  return (
    <Link
      href={trackerHref(tracker.id)}
      className={cn(
        'group flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:border-border-strong',
        meta.cls,
        className,
      )}
      title={`${tracker.label} — ${conditionLabel(tracker)}`}
    >
      <meta.Icon size={13} strokeWidth={1.75} className="flex-shrink-0" aria-hidden="true" />
      <span className="truncate max-w-[10rem] font-sans">{tracker.label}</span>
      <span className="font-mono tabular-nums font-semibold">
        {formatTrackerValue(tracker.currentValue, tracker.unit)}
      </span>
      {trend.direction != null && (
        <span className={cn('flex items-center gap-0.5 font-mono tabular-nums', trendCls)}>
          <TrendIcon size={12} strokeWidth={2} aria-hidden="true" />
          {trend.delta != null && trend.delta !== 0 && (
            <span>{formatTrackerValue(Math.abs(trend.delta), '')}</span>
          )}
        </span>
      )}
      <span className="ml-auto text-[10px] uppercase tracking-wide opacity-70">{statusLabel(status)}</span>
    </Link>
  )
}
