// SIR V2 — Cerebro F1 (sustrato del grafo tipado).
//
// Tipos de nodo y arista para la proyeccion del grafo del cerebro. NO es el
// mismo grafo que `src/lib/graph/` (ese es la visualizacion de /red, persona-
// centrica). Aca todo es una arista tipada con peso, sin nodo central.
//
// La proyeccion es pura: lee las tablas del schema y devuelve nodos + aristas
// con peso base derivado (constante por `EdgeKind`). El delta aprendido se
// suma desde `edge_weights` (mig 0106).

export type NodeType =
  | 'person'
  | 'goal'
  | 'org'
  | 'moment'
  | 'deal'
  | 'step'
  | 'tracker'

export interface TypedNode {
  type: NodeType
  id: string
  /** Etiqueta humana (nombre / titulo). Solo para el debug panel; no participa
   *  en logica de peso ni en dedupe. */
  label: string
}

/** Tipos de arista que la proyeccion sabe reconocer hoy. Cada uno tiene un
 *  peso base derivado (ver BASE_WEIGHT). */
export type EdgeKind =
  | 'family'              // person ↔ person via person_links
  | 'moment_participant'  // moment → person (participante confirmado)
  | 'moment_reference'    // moment → person (mencionado en otro chat)
  | 'goal_step'           // goal → step (KR/tarea)
  | 'goal_related_goal'   // goal → goal (goals.related_goals) — el cruce del slide 14
  | 'goal_related_person' // goal → person (goals.related_persons)
  | 'deal_contact'        // deal → person (contacto decisor)
  | 'deal_client_org'     // deal → org (empresa cliente)
  | 'deal_related'        // deal → person (equipo/relacionados)
  | 'memory_person'       // memory → person (memoria derivada)
  | 'observation_person'  // observation → person (captura raw)
  | 'tracker_goal'        // tracker → goal
  | 'tracker_step'        // tracker → step
  | 'money_person'        // person_money → person (registro de plata)
  | 'goal_cost'           // goal_cost → goal (costo material/esfuerzo)

export interface TypedEdge {
  /** Llave determinística que el store de pesos aprendidos usa como PK.
   *  Formato: `${srcType}:${srcId}:${dstType}:${dstId}:${kind}`. */
  key: string
  srcType: NodeType
  srcId: string
  dstType: NodeType
  dstId: string
  kind: EdgeKind
  /** Peso base derivado (constante por kind por ahora). */
  derivedWeight: number
  /** Delta aprendido (de `edge_weights`). Cero si no se cargo. */
  learnedWeight: number
  /** derivedWeight + learnedWeight, clamped a >= 0. Lo usa la difusion (F2). */
  weight: number
}

export interface Graph {
  nodes: TypedNode[]
  edges: TypedEdge[]
}

/** Pesos base por tipo de arista. Elegidos "razonablemente" para F1 — F3
 *  ajustara con Hebbian. Escala 0-10. */
export const BASE_WEIGHT: Record<EdgeKind, number> = {
  family: 8,
  moment_participant: 6,
  moment_reference: 4,
  goal_step: 5,
  goal_related_goal: 4,      // link declarado goal↔goal — moderado, refleja intencion no ejecucion
  goal_related_person: 5,    // persona explicitamente atada al goal — moderado-alto
  deal_contact: 7,
  deal_client_org: 6,
  deal_related: 3,
  memory_person: 2,
  observation_person: 2,
  tracker_goal: 5,
  tracker_step: 5,
  money_person: 4,
  goal_cost: 3,
}

/** Construye la llave deterministica de una arista.
 *  IMPORTANTE: el orden importa (dirigida). La proyeccion decide el orden por
 *  la semantica: family es persona_a→persona_b tal como esta en person_links
 *  (no se refleja al reves). */
export function edgeKey(
  srcType: NodeType,
  srcId: string,
  dstType: NodeType,
  dstId: string,
  kind: EdgeKind,
): string {
  return `${srcType}:${srcId}:${dstType}:${dstId}:${kind}`
}

/** Nodo "puente" (uniq id compuesto para dedupe cross-tipo). */
export function nodeKey(type: NodeType, id: string): string {
  return `${type}:${id}`
}
