'use client'
// SIR V2 — TimelineFiltersMobile (Fase 3a Issue #70)
// Boton "Filtros" + chip resumen + Sheet drawer con los controles completos.
// Usa el mismo TimelineFiltersBar para reusar logica.

import { useState } from 'react'
import { Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { TimelineFiltersBar } from './TimelineFilters'
import {
  ALL_EVENT_TYPES,
  DATE_RANGE_LABEL,
  type TimelineFilters,
} from '@/lib/timeline/types'

interface TimelineFiltersMobileProps {
  filters: TimelineFilters
  onChange: (next: TimelineFilters) => void
}

function summarize(filters: TimelineFilters): string {
  const range = DATE_RANGE_LABEL[filters.dateRange]
  const typesCount =
    filters.types.size === 0 || filters.types.size === ALL_EVENT_TYPES.length
      ? 'todos'
      : `${filters.types.size}`
  return `${range} · ${typesCount} tipos`
}

export function TimelineFiltersMobile({ filters, onChange }: TimelineFiltersMobileProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-3 text-[11px] font-mono w-full sm:w-auto justify-between"
        >
          <span className="inline-flex items-center gap-2">
            <Filter size={13} strokeWidth={1.75} aria-hidden="true" />
            Filtros
          </span>
          <span className="text-muted-foreground/70">· {summarize(filters)}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto p-4">
        <SheetHeader className="mb-4">
          <SheetTitle>Filtros del historial</SheetTitle>
        </SheetHeader>
        <TimelineFiltersBar filters={filters} onChange={onChange} />
        <div className="mt-6 pt-4 border-t border-border flex justify-end">
          <Button size="sm" onClick={() => setOpen(false)}>
            Aplicar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
