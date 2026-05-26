'use client'

// SIR V2 — SectionTitle (Sesion 18)
// Header consistente para Cards en todas las rutas.
// Replica el patron establecido en /dashboard (Sesion 17).

import type { LucideIcon } from 'lucide-react'

interface SectionTitleProps {
  icon: LucideIcon
  label: string
  count?: number | string
}

export function SectionTitle({ icon: Icon, label, count }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans">{label}</span>
      {count !== undefined && (
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60 ml-auto">{count}</span>
      )}
    </div>
  )
}
