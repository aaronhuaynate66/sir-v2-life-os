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
      <Icon size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
      <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">{label}</span>
      {count !== undefined && (
        <span className="text-[11px] font-mono tabular-nums text-text-tertiary ml-auto">{count}</span>
      )}
    </div>
  )
}
