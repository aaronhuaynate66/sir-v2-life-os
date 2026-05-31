'use client'
// SIR V2 — ApiErrorNotice: caja de error inline reutilizable.
//
// Consolida el bloque rojo "Error HTTP N: msg + detail" que estaba copiado
// en /buscar, DailyBriefingCard, ResumenClient y LoPersonal. Mismo markup
// (border-red-500/30 bg-red-500/5) -> sin regresión visual. `title` permite
// el caso especial (ej. 422 "Sin contexto todavía") y `children` un hint
// extra (ej. recordatorio de env var).

import { AlertCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ApiError } from '@/lib/api/errors'

export function ApiErrorNotice({
  error,
  title,
  className,
  children,
}: {
  error: ApiError
  /** Override del título por defecto `Error HTTP <status>: <message>`. */
  title?: string
  /** Clases extra (padding/margen propios de cada vista). */
  className?: string
  /** Contenido extra debajo del detail (hints accionables). */
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-1',
        className,
      )}
      role="alert"
    >
      <div className="flex items-center gap-1.5 font-medium text-red-400">
        <AlertCircle size={12} strokeWidth={2} aria-hidden="true" />
        {title ?? `Error HTTP ${error.status}: ${error.message}`}
      </div>
      {error.detail && <div className="text-muted-foreground">{error.detail}</div>}
      {children}
    </div>
  )
}
