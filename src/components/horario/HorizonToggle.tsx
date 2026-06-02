'use client'

// SIR V2 — /horario: toggle de horizonte (Día / Semana / Mes).
//
// Control segmentado simple. El acento activo usa --primary (no la marca, que
// queda reservada para IA/destacados); coherente con el resto del dark theme.

import { cn } from '@/lib/utils'
import type { Horizon } from '@/lib/horario/cockpit'

const OPTIONS: { value: Horizon; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
]

export function HorizonToggle({
  value,
  onChange,
}: {
  value: Horizon
  onChange: (next: Horizon) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Horizonte del horario"
      className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-surface-2 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3 py-1.5 rounded text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-primary/[0.12] text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
