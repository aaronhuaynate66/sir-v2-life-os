// SIR V2 — Filtrado PURO de nodos/edges del grafo (categoría + salud mínima).
//
// Extraído de GraphView para poder testearlo y, sobre todo, para arreglar el
// bug del GRAFO VACÍO:
//
//   ANTES, GraphView ocultaba todo nodo con interactionCount === 0. Ese
//   interactionCount sale de relationships.history (ver builder.ts), que en
//   prod está VACÍO porque las capturas escriben en `observations`, no en
//   `history`. Resultado: TODAS las personas tenían interactionCount 0 → se
//   ocultaban → grafo vacío, sin importar el slider de salud.
//
//   AHORA: una persona aparece siempre que pase los filtros REALES (categoría
//   + salud mínima). No se oculta por una fuente de "actividad" muerta. Con el
//   slider de salud en 0 se ven TODAS las personas. El nodo self es siempre
//   visible. La salud mínima sigue funcionando como filtro.

import type { GraphData, GraphFilters, GraphNode } from './types'

/** ¿Este nodo pasa los filtros activos? Self siempre visible. */
export function isNodeVisible(node: GraphNode, filters: GraphFilters): boolean {
  if (node.isSelf) return true
  // "Solo vínculos directos": oculta los de 2º grado (familiares de contactos
  // sin interacción directa registrada — flag secondDegree del builder, que ya
  // sale de observations/person_logs). Compone con categoría + salud.
  if (filters.onlyDirect && node.secondDegree) return false
  if (filters.category !== 'all' && node.category !== filters.category) return false
  if (node.healthScore < filters.minHealth) return false
  return true
}

/**
 * Aplica los filtros al GraphData y poda los edges a los que conectan nodos
 * visibles. Puro — sin side effects, memoizable.
 */
export function filterGraph(data: GraphData, filters: GraphFilters): GraphData {
  const nodes = data.nodes.filter((n) => isNodeVisible(n, filters))
  const visibleIds = new Set(nodes.map((n) => n.id))
  const edges = data.edges.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  )
  return { nodes, edges }
}
