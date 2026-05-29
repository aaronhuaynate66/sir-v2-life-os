'use client'
// SIR V2 — TimelineCardGrouped (Captura consolidada)
//
// Render compacto y consolidado de un GroupedTimelineEvent. Una captura
// báscula (11+ métricas) ocupa UNA card con tabla 2 columnas en vez de
// inundar el feed con N cards desconectadas.
//
// Si event.groupedItems es vacio o undefined, este componente NO se
// debe renderizar — el caller (TimelineFeed) hace el switch via isGrouped().

import { Camera } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { TYPE_VISUALS } from '@/lib/timeline/icons'
import type { TimelineEvent, GroupedItem } from '@/lib/timeline/types'
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

interface TimelineCardGroupedProps {
  event: TimelineEvent
  nowMs: number
}

export function TimelineCardGrouped({ event, nowMs }: TimelineCardGroupedProps) {
  const items = event.groupedItems ?? []
  if (items.length === 0) return null

  // Visual del header: por G5, usa Camera icon (representa "captura")
  // en lugar del icono del tipo predominante. Mantiene el chip de color
  // del tipo para que el grupo siga reconocible al lado de cards single.
  const typeVisual = TYPE_VISUALS[event.type]

  return (
    <Card className="shadow-none transition-colors duration-200 hover:border-primary/30">
      <CardContent className="p-4 sm:p-5">
        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex-shrink-0 w-9 h-9 rounded-full border flex items-center justify-center',
              typeVisual.chipClass,
            )}
            aria-hidden="true"
          >
            <Camera size={16} strokeWidth={1.75} className={typeVisual.iconClass} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-mono uppercase tracking-wider',
                  typeVisual.chipClass,
                )}
              >
                Captura
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] font-mono tracking-wider bg-muted/40 text-muted-foreground border-border"
              >
                {items.length} métrica{items.length === 1 ? '' : 's'}
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

            {event.body && (
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {event.body}
              </p>
            )}
          </div>
        </div>

        <Separator className="my-3 opacity-50" />

        {/* ─── Tabla 2 columnas ──────────────────────────────── */}
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5"
          aria-label="Métricas de la captura"
        >
          {items.map((it: GroupedItem) => (
            <li
              key={it.id}
              className="flex items-baseline justify-between gap-3 border-b border-border/30 pb-1 last:border-0 sm:last:border-b"
            >
              <span className="text-xs text-muted-foreground truncate">{it.label}</span>
              <span className="text-sm font-mono tabular-nums text-foreground flex-shrink-0">
                {it.display}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
