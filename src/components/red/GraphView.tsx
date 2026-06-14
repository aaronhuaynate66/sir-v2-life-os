'use client'
// SIR V2 — Orquestador del grafo. Une store + filtros + canvas + legend.
//
// GraphCanvas se carga via dynamic import con ssr: false porque depende
// de <canvas>. Mientras carga, mostramos un skeleton.

import { useCallback, useMemo, useState } from 'react'
import { orgSlug } from '@/lib/people/companyHub'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Network } from 'lucide-react'

import { GraphFiltersBar } from './GraphFilters'
import { GraphLegend } from './GraphLegend'
import { buildGraphData } from '@/lib/graph/builder'
import { filterGraph } from '@/lib/graph/filter'
import { buildHover, type InteractionInfo, type NodeHover } from '@/lib/graph/hover'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useRecommendationStore } from '@/stores/useRecommendationStore'
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
  /** Resumen de última interacción por person.id (server-fetched, sin N+1). */
  interactionById?: Record<string, InteractionInfo>
}

export function GraphView({ selfFullName, selfEmail, directContactIds = [], interactionById = {} }: GraphViewProps) {
  const router = useRouter()
  const { people, relationships, personLinks } = useRelationshipStore()
  const recommendations = useRecommendationStore((s) => s.recommendations)
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS)

  // Última recomendación activa por persona (del store client, vía relatedPersons).
  const recById = useMemo(() => {
    const map: Record<string, string> = {}
    const sorted = [...recommendations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    for (const r of sorted) {
      if (r.status === 'dismissed' || r.status === 'completed') continue
      for (const pid of r.relatedPersons ?? []) {
        if (!map[pid]) map[pid] = r.title // el más reciente (ya ordenado desc)
      }
    }
    return map
  }, [recommendations])

  // Hover por persona: edad + ciclo (de la persona) + última interacción/ánimo
  // (server) + recomendación (store). Depende de "ahora" → vive acá, no en el
  // builder (que se mantiene puro).
  const hoverById = useMemo(() => {
    const now = new Date()
    const map: Record<string, NodeHover> = {}
    for (const p of people) {
      map[p.id] = buildHover({ person: p, interaction: interactionById[p.id], recommendation: recById[p.id], now })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, interactionById, recById])

  // Build raw data una vez (memoizado).
  const rawData: GraphData = useMemo(
    () => buildGraphData({ people, relationships, personLinks: personLinks ?? [], directContactIds, hoverById, selfFullName, selfEmail }),
    [people, relationships, personLinks, directContactIds, hoverById, selfFullName, selfEmail],
  )

  // Clic en nodo → navegar a la ficha (self → /yo).
  const onNavigate = useCallback(
    (nodeId: string, isSelf: boolean) => {
      // Nodo-empresa (hub, id 'org:<key>'): abre su ficha de empresa/holding.
      if (nodeId.startsWith('org:')) {
        router.push(`/empresas/${orgSlug(nodeId.slice(4))}`)
        return
      }
      router.push(isSelf ? '/yo' : `/relaciones/${encodeURIComponent(nodeId)}`)
    },
    [router],
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
          <CardContent className="py-0">
            <EmptyState icon={Network} title={emptyStateMessage.title} hint={emptyStateMessage.body} />
          </CardContent>
        </Card>
      ) : (
        <GraphCanvas data={filteredData} onNavigate={onNavigate} />
      )}

      <GraphLegend />
    </div>
  )
}
