'use client'
// SIR V2 — Filtros del grafo: tabs (categoría) + slider (salud minima).

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { CATEGORY_LABEL, FILTERABLE_CATEGORIES } from '@/lib/graph/colors'
import type { GraphCategory, GraphFilters } from '@/lib/graph/types'

interface GraphFiltersProps {
  filters: GraphFilters
  onChange: (next: GraphFilters) => void
}

export function GraphFiltersBar({ filters, onChange }: GraphFiltersProps) {
  function setCategory(category: GraphCategory | 'all') {
    onChange({ ...filters, category })
  }

  function setMinHealth(value: number) {
    onChange({ ...filters, minHealth: value })
  }

  function toggleOnlyDirect() {
    onChange({ ...filters, onlyDirect: !filters.onlyDirect })
  }

  function toggleShowOrgs() {
    onChange({ ...filters, showOrgs: !filters.showOrgs })
  }

  return (
    <div className="space-y-3">
      {/* Toggle: solo vínculos directos (oculta 2º grado). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mr-1">
          Vínculos
        </span>
        <Button
          type="button"
          variant={filters.onlyDirect ? 'default' : 'outline'}
          size="sm"
          onClick={toggleOnlyDirect}
          className={cn(
            // Hit-area táctil ≥44px en mobile (WCAG 2.5.5); en desktop revierte a h-7.
            'h-11 sm:h-7 px-2.5 text-[11px]',
            filters.onlyDirect && 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
          aria-pressed={filters.onlyDirect}
        >
          Solo vínculos directos
        </Button>
        <span className="text-[10px] text-muted-foreground/60">
          {filters.onlyDirect
            ? 'ocultando 2º grado (familiares de contactos)'
            : 'mostrando 2º grado'}
        </span>
        <Button
          type="button"
          variant={filters.showOrgs ? 'default' : 'outline'}
          size="sm"
          onClick={toggleShowOrgs}
          className={cn(
            'h-11 sm:h-7 px-2.5 text-[11px]',
            filters.showOrgs && 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
          aria-pressed={filters.showOrgs}
        >
          Mostrar organizaciones
        </Button>
        <span className="text-[10px] text-muted-foreground/60">
          {filters.showOrgs ? 'mostrando empresas/grupos' : 'ocultas por defecto'}
        </span>
      </div>

      {/* Tabs de categoría */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mr-1">
          Categoría
        </span>
        <CategoryTab active={filters.category === 'all'} onClick={() => setCategory('all')} label="Todos" />
        {FILTERABLE_CATEGORIES.map((cat) => (
          <CategoryTab
            key={cat}
            active={filters.category === cat}
            onClick={() => setCategory(cat)}
            label={CATEGORY_LABEL[cat]}
          />
        ))}
      </div>

      {/* Slider salud mínima */}
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="min-health" className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">
          Salud mínima
        </Label>
        <input
          id="min-health"
          type="range"
          min={0}
          max={100}
          step={5}
          value={filters.minHealth}
          onChange={(e) => setMinHealth(Number(e.target.value))}
          className="flex-1 max-w-xs accent-primary"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={filters.minHealth}
        />
        <span className="text-xs font-mono tabular-nums text-foreground min-w-[3ch] text-right">
          {filters.minHealth}
        </span>
      </div>
    </div>
  )
}

function CategoryTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
      className={cn(
        // Hit-area táctil ≥44px en mobile (WCAG 2.5.5); en desktop revierte a h-7.
        'h-11 sm:h-7 px-2.5 text-[11px] font-mono',
        active && 'bg-primary text-primary-foreground hover:bg-primary/90',
      )}
      aria-pressed={active}
    >
      {label}
    </Button>
  )
}
