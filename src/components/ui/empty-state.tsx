// SIR V2 — EmptyState (ronda 3)
// Primitivo compartido para estados vacíos: icono + título + hint opcional +
// acción opcional, centrado. Reemplaza las copias hand-rolled repartidas por
// las pantallas (icon + título + hint) para un patrón visual consistente.
//
// Para el estado vacío del timeline (con variantes no-range/no-search/error y
// wrapper en Card) ver components/timeline/EmptyState.tsx — ese es específico
// de dominio y vive aparte a propósito.

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon: LucideIcon
  /** Línea principal (honesta, sin alarmismo): "Sin X.", "Calibrando…". */
  title: string
  /** Sub-línea opcional con el siguiente paso. */
  hint?: string
  /** Acción opcional (ej. un Button) debajo del hint. */
  action?: ReactNode
  /** Densidad del padding vertical. 'sm' para dentro de una card, 'md' (default) para página. */
  size?: 'sm' | 'md'
  className?: string
}

export function EmptyState({ icon: Icon, title, hint, action, size = 'md', className }: EmptyStateProps) {
  const sm = size === 'sm'
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', sm ? 'py-6 gap-2' : 'py-12 gap-3', className)}>
      <Icon size={sm ? 20 : 28} strokeWidth={1.5} className="text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground/60 max-w-md">{hint}</p>}
      {action}
    </div>
  )
}
