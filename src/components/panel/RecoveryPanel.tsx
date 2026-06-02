// SIR V2 — RecoveryPanel (P4): tarjeta accionable del modo recuperación.
// Muestra por qué se activó (reasons) y qué hacer ahora (priorities). El color
// escala con la severidad (soft = ámbar, hard = rojo).
'use client'

import { LifeBuoy, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { RecoveryAssessment } from '@/engines/recovery'
import { cn } from '@/lib/utils'

export function RecoveryPanel({ data }: { data: RecoveryAssessment }) {
  if (!data.active) return null
  const hard = data.severity === 'hard'
  const accent = hard ? 'text-bad' : 'text-warn'
  const border = hard ? 'border-bad/30' : 'border-warn/30'
  const bg = hard ? 'bg-bad/[0.06]' : 'bg-warn/[0.06]'

  return (
    <Card className={cn('shadow-none mb-6', border, bg)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <LifeBuoy size={16} strokeWidth={1.75} className={accent} aria-hidden="true" />
          <span className={cn('text-sm font-semibold', accent)}>
            Modo recuperación{hard ? ' · prioridad alta' : ''}
          </span>
        </div>

        {data.reasons.length > 0 && (
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            {data.reasons.join(' ')}
          </p>
        )}

        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1.5">Prioridades ahora</div>
        <ul className="space-y-1.5">
          {data.priorities.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground/90 leading-snug">
              <Check size={14} strokeWidth={2} className={cn('flex-shrink-0 mt-0.5', accent)} aria-hidden="true" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
