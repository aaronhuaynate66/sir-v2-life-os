// SIR V2 — Tipos del grafo de relaciones (/red/grafo).
// Port de la vista de SIR V1 — visualizacion macro de la red personal.

import type { NodeHover } from './hover'

export type GraphCategory =
  | 'familia'
  | 'personal'
  | 'profesional'
  | 'networking'
  | 'estrategico'
  | 'desarrollo'
  | 'self'

export interface GraphNode {
  /** 'self' para el nodo central, person.slug (o person.id fallback) para los demas. */
  id: string
  /** Iniciales de 2 chars para render dentro del circulo. */
  label: string
  /** Nombre corto (primer nombre) visible debajo del nodo. */
  shortName: string
  /** Nombre completo (tooltip hover). */
  fullName: string
  category: GraphCategory
  /** 0-100. Para self queda en 100 (no aplica). */
  healthScore: number
  /** Cantidad de items en relationships.history. Para self queda en 0. */
  interactionCount: number
  /** importanceScore 1-10 (jerarquía → tamaño del nodo). self = 10. */
  score: number
  /** 2º grado: familiar de un contacto SIN interacción directa con self.
   *  Cuelga de su contacto (no del centro) y se dibuja más chico/atenuado. */
  secondDegree?: boolean
  /** Info accionable para el tooltip de hover (última interacción, recomendación,
   *  edad, ciclo, ánimo). Armada en GraphView (depende de "ahora" + server). */
  hover?: NodeHover
  isSelf?: boolean
  // Posicion fijada (solo para self). react-force-graph-2d respeta fx/fy.
  fx?: number
  fy?: number
}

export interface GraphEdge {
  /** Node id (self) */
  source: string
  /** Node id (slug) */
  target: string
  category: GraphCategory
  /** Etiqueta visible: "Familia", "Personal", etc. */
  label: string
  color: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** Filtros aplicables desde la UI antes de pasar a GraphCanvas. */
export interface GraphFilters {
  category: GraphCategory | 'all'
  minHealth: number  // 0-100
  /** true = "solo vínculos directos": oculta los nodos de 2º grado (familiares
   *  de contactos sin interacción directa registrada con self). */
  onlyDirect: boolean
}

export const DEFAULT_FILTERS: GraphFilters = {
  category: 'all',
  minHealth: 0,
  // Arranca activado: Aaron prefiere ver solo su red directa por defecto.
  onlyDirect: true,
}
