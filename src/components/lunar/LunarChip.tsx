'use client'
// SIR V2 — LunarChip
//
// Chip pequeño que muestra la fase lunar de UNA fecha. Default = ahora.
// Sin estado interno; cada render computa con moonPhase(date) — eso lo
// hace seguro de re-usar en cualquier punto de la UI sin coupling al
// dashboard (Mission Control hoy; eventos/memorias en compute-on-read
// para Fase 3c).

import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { moonPhase } from '@/lib/lunar/phase'
import { cn } from '@/lib/utils'

export interface LunarChipProps {
  /** Fecha para la que mostrar la fase. Default: now. */
  date?: Date
  /** Tamaño del chip. 'sm' (default) es para inline tipo metadata;
   *  'md' agrega illumination explicita y se ve mas "card-light". */
  size?: 'sm' | 'md'
  /** Class extra para el wrapper. */
  className?: string
}

export function LunarChip({ date, size = 'sm', className }: LunarChipProps) {
  const phase = useMemo(() => moonPhase(date ?? new Date()), [date])

  if (size === 'md') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5',
          className,
        )}
        title={`Día ${Math.round(phase.ageDays)} del ciclo lunar · ${(phase.illumination * 100).toFixed(0)}% iluminada`}
      >
        <span className="text-base leading-none" aria-hidden="true">
          {phase.symbol}
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-medium text-foreground">{phase.label}</span>
          <span className="text-[10px] font-mono text-muted-foreground/80">
            {(phase.illumination * 100).toFixed(0)}% · día {Math.round(phase.ageDays)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <Badge
      variant="outline"
      className={cn('inline-flex items-center gap-1.5 text-[11px] font-normal', className)}
      title={`Día ${Math.round(phase.ageDays)} del ciclo lunar · ${(phase.illumination * 100).toFixed(0)}% iluminada · ${phase.waxing ? 'creciendo' : 'menguando'}`}
    >
      <span aria-hidden="true">{phase.symbol}</span>
      <span>{phase.label}</span>
    </Badge>
  )
}
