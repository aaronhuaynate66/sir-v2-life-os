'use client'
// SIR V2 — TimelineFilters (Fase 3a Issue #70)
// Sticky bar de filtros para desktop (>=lg). Para mobile usar TimelineFiltersMobile.
// Componentes shadcn instalados unicamente: Button, Input, Badge, Card.
// El period selector y el multi-select de tipos se construyen con Button + estado.

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TYPE_VISUALS } from '@/lib/timeline/icons'
import {
  DATE_RANGE_PRESETS,
  DATE_RANGE_LABEL,
  ALL_EVENT_TYPES,
  type DateRangePreset,
  type TimelineEventType,
  type TimelineFilters,
} from '@/lib/timeline/types'
import { cn } from '@/lib/utils'

interface TimelineFiltersProps {
  filters: TimelineFilters
  onChange: (next: TimelineFilters) => void
}

export function TimelineFiltersBar({ filters, onChange }: TimelineFiltersProps) {
  function setDateRange(preset: DateRangePreset) {
    onChange({ ...filters, dateRange: preset })
  }

  function toggleType(type: TimelineEventType) {
    const next = new Set(filters.types)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    onChange({ ...filters, types: next })
  }

  function setSearch(value: string) {
    onChange({ ...filters, search: value })
  }

  function clearSearch() {
    onChange({ ...filters, search: '' })
  }

  return (
    <div className="space-y-4">
      {/* Range presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-sans mr-1">
          Rango
        </span>
        {DATE_RANGE_PRESETS.map((preset) => {
          const active = filters.dateRange === preset
          return (
            <Button
              key={preset}
              type="button"
              variant={active ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange(preset)}
              className={cn(
                'h-7 px-2.5 text-[11px] font-mono',
                active && 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
              aria-pressed={active}
            >
              {DATE_RANGE_LABEL[preset]}
            </Button>
          )
        })}
      </div>

      {/* Type multi-select */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-sans mr-1">
          Tipos
        </span>
        {ALL_EVENT_TYPES.map((type) => {
          const visual = TYPE_VISUALS[type]
          const Icon = visual.Icon
          const active = filters.types.has(type)
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors',
                active
                  ? visual.chipClass
                  : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon size={12} strokeWidth={1.75} aria-hidden="true" />
              {visual.label}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search
          size={14}
          strokeWidth={1.75}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Buscar en el historial…"
          value={filters.search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9 h-9 text-sm"
          aria-label="Buscar en el historial"
        />
        {filters.search.length > 0 && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted"
          >
            <X size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
