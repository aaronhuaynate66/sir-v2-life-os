'use client'
// SIR V2 — PartialFailureBanner (Fase 3a Issue #70)
// Aviso no-bloqueante. Lista los tipos que fallaron + boton de retry no
// destructivo (solo re-fetcha los fallidos, mantiene los exitosos).

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TYPE_VISUALS } from '@/lib/timeline/icons'
import type { TimelineEventType } from '@/lib/timeline/types'

interface PartialFailureBannerProps {
  failedTypes: TimelineEventType[]
  onRetry: () => void
}

export function PartialFailureBanner({ failedTypes, onRetry }: PartialFailureBannerProps) {
  if (failedTypes.length === 0) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="border border-warn/30 bg-warn-soft rounded-lg px-4 py-3 mb-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={16}
          strokeWidth={1.75}
          className="text-warn mt-0.5 flex-shrink-0"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs sm:text-sm text-warn-foreground font-medium leading-snug">
            No pude cargar {failedTypes.length} {failedTypes.length === 1 ? 'tipo de evento' : 'tipos de evento'}:
          </div>
          <div className="text-[11px] sm:text-xs text-warn-foreground/80 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            {failedTypes.map((t) => (
              <span key={t} className="font-mono">
                · {TYPE_VISUALS[t].label}
              </span>
            ))}
          </div>
          <div className="text-[11px] text-warn-foreground/60 mt-1">
            Los demás eventos sí cargaron.
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="border-warn/40 bg-warn-soft text-warn-foreground hover:bg-warn/20 hover:text-warn-foreground flex-shrink-0"
        >
          Reintentar
        </Button>
      </div>
    </div>
  )
}
