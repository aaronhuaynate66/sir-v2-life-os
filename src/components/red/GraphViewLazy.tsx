'use client'

// SIR V2 — GraphViewLazy · shim client para dynamic import de GraphView
//
// /red renderiza el grafo entero (react-force-graph-2d + GraphCanvas +
// GraphFilters + GraphLegend + graph/builder/filter/hover). Aunque GraphCanvas
// ya usa dynamic internamente, TODO el orchestrator viaja en el bundle.
//
// Este shim envuelve GraphView con next/dynamic + ssr:false → el primer
// request de /red carga solo un placeholder + el chunk se pide on-demand al
// hidratar. Similar al patron de PersonDetailLazy.

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { GraphView as GraphViewType } from './GraphView'

const GraphView = dynamic(
  () => import('./GraphView').then((m) => ({ default: m.GraphView })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[60vh] sm:h-[70vh] min-h-[400px] rounded-lg border border-border bg-muted/10 animate-pulse" />
    ),
  },
)

type Props = ComponentProps<typeof GraphViewType>

export function GraphViewLazy(props: Props) {
  return <GraphView {...props} />
}
