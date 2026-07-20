'use client'
// SIR V2 — Sección colapsable con encabezado. Herramienta del fix de DENSIDAD
// (UX audit #5): pantallas que apilaban 20+ paneles planos ahora los agrupan en
// 2-4 secciones con título; lo secundario arranca colapsado. Reusable en /yo,
// /relaciones, ficha, /panel. Los hijos NO se montan hasta abrir (mejor perf en
// paneles pesados con IA).

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface CollapsibleSectionProps {
  title: string
  /** Pista corta a la derecha del título (qué hay dentro). */
  hint?: string
  /** Abierta al montar. Default false (lo secundario arranca cerrado). */
  defaultOpen?: boolean
  /** Conteo opcional (ej. cuántos paneles/items) para dar contexto sin abrir. */
  count?: number
  children: ReactNode
  className?: string
}

export function CollapsibleSection({
  title, hint, defaultOpen = false, count, children, className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={cn('rounded-lg border border-border/70 bg-card/40', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 rounded-lg"
      >
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">{title}</span>
          {typeof count === 'number' && (
            <span className="text-[10px] font-mono text-muted-foreground/60">{count}</span>
          )}
          {hint && <span className="text-[11px] text-muted-foreground/70 truncate">{hint}</span>}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className={cn('shrink-0 text-muted-foreground/70 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && <div className="space-y-4 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">{children}</div>}
    </section>
  )
}
