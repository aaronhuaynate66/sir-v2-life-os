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
      className="border border-amber-500/30 bg-amber-500/10 rounded-lg px-4 py-3 mb-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={16}
          strokeWidth={1.75}
          className="text-amber-400 mt-0.5 flex-shrink-0"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs sm:text-sm text-amber-200 font-medium leading-snug">
            No pude cargar {failedTypes.length} {failedTypes.length === 1 ? 'tipo de evento' : 'tipos de evento'}:
          </div>
          <div className="text-[11px] sm:text-xs text-amber-200/80 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            {failedTypes.map((t) => (
              <span key={t} className="font-mono">
                · {TYPE_VISUALS[t].label}
              </span>
            ))}
          </div>
          <div className="text-[11px] text-amber-200/60 mt-1">
            Los demás eventos sí cargaron.
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 hover:text-amber-200 flex-shrink-0"
        >
          Reintentar
        </Button>
      </div>
    </div>
  )
}
