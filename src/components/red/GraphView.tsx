'use client'
// SIR V2 — Orquestador del grafo. Une store + filtros + canvas + legend.
//
// GraphCanvas se carga via dynamic import con ssr: false porque depende
// de <canvas>. Mientras carga, mostramos un skeleton.

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Network } from 'lucide-react'

import { GraphFiltersBar } from './GraphFilters'
import { GraphLegend } from './GraphLegend'
import { buildGraphData } from '@/lib/graph/builder'
import { filterGraph } from '@/lib/graph/filter'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { DEFAULT_FILTERS, type GraphData, type GraphFilters } from '@/lib/graph/types'

// Dynamic import con ssr:false porque react-force-graph-2d usa <canvas>.
const GraphCanvas = dynamic(
  () => import('./GraphCanvas').then((mod) => mod.GraphCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[60vh] sm:h-[70vh] min-h-[400px] rounded-lg border border-border bg-muted/10 flex items-center justify-center">
        <Skeleton className="w-20 h-20 rounded-full" />
      </div>
    ),
  },
)

interface GraphViewProps {
  selfFullName: string | null
  selfEmail: string
  /** IDs de personas con interacción directa (observations/logs). Server-fetched.
   *  Un familiar-de-contacto que NO esté acá es 2º grado (cuelga de su contacto). */
  directContactIds?: string[]
}

export function GraphView({ selfFullName, selfEmail, directContactIds = [] }: GraphViewProps) {
  const { people, relationships, personLinks } = useRelationshipStore()
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS)

  // Build raw data una vez (memoizado).
  const rawData: GraphData = useMemo(
    () => buildGraphData({ people, relationships, personLinks: personLinks ?? [], directContactIds, selfFullName, selfEmail }),
    [people, relationships, personLinks, directContactIds, selfFullName, selfEmail],
  )

  // Aplicar filtros (categoría + salud mínima). NO ocultamos por "actividad":
  // el interactionCount viene de relationships.history, que en prod está vacío
  // (las capturas escriben en observations) → ocultaba a TODAS las personas.
  // Ver lib/graph/filter.ts.
  const filteredData = useMemo(
    () => filterGraph(rawData, filters),
    [rawData, filters],
  )

  // Mensaje de empty state segun el caso
  const noNodesAtAll = rawData.nodes.length <= 1 // solo self
  const noNodesInFilter = filteredData.nodes.length <= 1
  const emptyStateMessage = (() => {
    if (noNodesAtAll) {
      return {
        title: 'Tu red está vacía',
        body: 'Agregá personas desde /relaciones para que aparezcan en el grafo.',
      }
    }
    if (noNodesInFilter && filters.category !== 'all') {
      if (filters.category === 'estrategico' || filters.category === 'desarrollo') {
        return {
          title: 'Sin contactos en esta categoría',
          body: `Marcá personas con tag '${filters.category}' desde su perfil para que aparezcan acá.`,
        }
      }
      return {
        title: 'Sin contactos en esta categoría con esa salud',
        body: 'Ajustá los filtros para ver más contactos.',
      }
    }
    if (noNodesInFilter) {
      return {
        title: 'Sin contactos con esa salud mínima',
        body: 'Bajá el slider para ver más contactos.',
      }
    }
    return null
  })()

  return (
    <div className="space-y-4">
      <GraphFiltersBar filters={filters} onChange={setFilters} />

      {emptyStateMessage ? (
        <Card className="shadow-none">
          <CardContent className="p-8 sm:p-12 flex flex-col items-center text-center gap-3">
            <Network size={28} strokeWidth={1.25} className="text-muted-foreground/60" aria-hidden="true" />
            <div className="text-sm font-medium text-foreground">{emptyStateMessage.title}</div>
            <div className="text-xs text-muted-foreground max-w-md">{emptyStateMessage.body}</div>
          </CardContent>
        </Card>
      ) : (
        <GraphCanvas data={filteredData} />
      )}

      <GraphLegend />
    </div>
  )
}
