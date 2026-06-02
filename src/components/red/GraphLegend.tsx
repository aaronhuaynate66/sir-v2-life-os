'use client'
// SIR V2 — Leyenda de colores del grafo.

import { CATEGORY_COLOR, CATEGORY_LABEL, FILTERABLE_CATEGORIES } from '@/lib/graph/colors'

export function GraphLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 border border-border rounded-md bg-muted/20">
      <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">
        Categorías
      </span>
      {FILTERABLE_CATEGORIES.map((cat) => (
        <div key={cat} className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-full inline-block flex-shrink-0"
            style={{ backgroundColor: CATEGORY_COLOR[cat] }}
            aria-hidden="true"
          />
          <span className="text-[11px] text-muted-foreground">{CATEGORY_LABEL[cat]}</span>
        </div>
      ))}
    </div>
  )
}
