'use client'
// SIR V2 — TimelineCard (Fase 3a Issue #70)
// Render compacto de un evento del feed. Sin boton [->]: por Implementation
// Note #6 del ADR 0005, no renderizamos no-ops; no hay rutas de detalle por
// tipo en esta sesion.

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { TYPE_VISUALS } from '@/lib/timeline/icons'
import type { TimelineEvent } from '@/lib/timeline/types'
import { cn } from '@/lib/utils'

function formatRelative(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime()
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'hace un instante'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`
  const months = Math.floor(days / 30)
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`
  const years = Math.floor(days / 365)
  return `hace ${years} ${years === 1 ? 'año' : 'años'}`
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface TimelineCardProps {
  event: TimelineEvent
  /** Pasado por el feed; se computa una vez por render para que todas las
   *  cards de una pagina coincidan en "ahora". */
  nowMs: number
}

export function TimelineCard({ event, nowMs }: TimelineCardProps) {
  const visual = TYPE_VISUALS[event.type]
  const Icon = visual.Icon

  return (
    <Card className="shadow-none transition-colors duration-200 hover:border-primary/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex-shrink-0 w-9 h-9 rounded-full border flex items-center justify-center',
              visual.chipClass,
            )}
            aria-hidden="true"
          >
            <Icon size={16} strokeWidth={1.75} className={visual.iconClass} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
              <Badge
                variant="outline"
                className={cn('text-[10px] font-mono uppercase tracking-wider', visual.chipClass)}
              >
                {visual.label}
              </Badge>
              <span className="text-[11px] font-mono text-muted-foreground/80">
                {formatRelative(event.occurredAt, nowMs)}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground/40" aria-hidden="true">
                ·
              </span>
              <time
                className="text-[11px] font-mono text-muted-foreground/60"
                dateTime={event.occurredAt}
              >
                {formatAbsolute(event.occurredAt)}
              </time>
            </div>

            <h3 className="text-sm sm:text-base font-medium text-foreground leading-snug">
              {event.title}
            </h3>

            {event.body && (
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-1.5 line-clamp-3">
                {event.body}
              </p>
            )}

            {event.tags.length > 0 && (
              <>
                <Separator className="my-3 opacity-50" />
                <div className="flex flex-wrap gap-1.5">
                  {event.tags.slice(0, 5).map((tag, i) => (
                    <span
                      key={`${event.id}:tag:${i}`}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80 border border-border/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
