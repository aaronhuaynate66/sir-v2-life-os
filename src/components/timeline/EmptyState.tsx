'use client'
// SIR V2 — Timeline empty states (Fase 3a Issue #70)
// 3 variantes per Implementation Note #4 del ADR 0005.

import { Calendar, SearchX, AlertTriangle, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export type EmptyVariant = 'no-range' | 'no-search' | 'error'

interface EmptyStateProps {
  variant: EmptyVariant
  /** Solo usado en no-search. */
  query?: string
  /** Solo usado en error. */
  onRetry?: () => void
}

const COPY: Record<EmptyVariant, { Icon: LucideIcon; title: (q?: string) => string; sub: string; iconClass: string }> = {
  'no-range': {
    Icon: Calendar,
    title: () => 'No hay eventos en este rango.',
    sub: 'Probá ampliar el período o cambiar los tipos seleccionados.',
    iconClass: 'text-muted-foreground/60',
  },
  'no-search': {
    Icon: SearchX,
    title: (q) => `No encontré resultados para «${q ?? ''}».`,
    sub: 'Probá otros términos o limpiá la búsqueda.',
    iconClass: 'text-muted-foreground/60',
  },
  error: {
    Icon: AlertTriangle,
    // Fallo de carga recuperable: ámbar (no rojo) — es reintentable, no crítico.
    title: () => 'No pudimos cargar el historial.',
    sub: 'Verificá tu conexión y reintentá.',
    iconClass: 'text-amber-400',
  },
}

export function EmptyState({ variant, query, onRetry }: EmptyStateProps) {
  const { Icon, title, sub, iconClass } = COPY[variant]
  return (
    <Card className="shadow-none">
      <CardContent className="p-8 sm:p-12 flex flex-col items-center text-center gap-3">
        <Icon size={28} strokeWidth={1.25} className={iconClass} aria-hidden="true" />
        <div className="text-sm font-medium text-foreground">{title(query)}</div>
        <div className="text-xs text-muted-foreground max-w-md">{sub}</div>
        {variant === 'error' && onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="mt-2">
            Reintentar
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
