// SIR V2 — Cerebro F2 · Difusion (spreading activation).
//
// Un nodo semilla recibe energia inicial (100 por defecto). En cada hop, cada
// nodo activo reparte su energia entre sus vecinos ponderada por peso de arista
// y multiplica por `decayPerHop`. La activacion final de un nodo es la SUMA
// de todo lo que le llego a lo largo de los hops (los caminos multiples
// refuerzan).
//
// Diseno:
//  - El grafo se trata NO-DIRIGIDO (una arista goal→step activa el goal
//    cuando salgo del step, y viceversa). El projector produce direcciones
//    semanticas; aca todas se leen simetricas para propagacion.
//  - Los self-loops (memory_person, observation_person, money_person, goal_cost)
//    NO propagan — son "senal sobre el nodo", no un puente. Se ignoran en la
//    adyacencia. F3 los va a usar para modular pesos aprendidos.
//  - `minActivation` corta los caminos que se apagan (evita ruido y ciclos
//    infinitesimales).
//  - Puro y deterministico: mismo input → mismo output. Testeable sin infra.
//
// NO usa IA. NO afirma nada. Devuelve un ranking numerico que F3 (Hebbian)
// va a leer para reforzar/debilitar aristas y que F4 (surfacing) va a mostrar.

import type { Graph, TypedEdge } from './types'
import { nodeKey } from './types'

export interface DiffusionOptions {
  /** Energia inicial en el nodo semilla. Default 100. */
  seedActivation?: number
  /** Factor multiplicativo por hop (0-1). Default 0.6. */
  decayPerHop?: number
  /** Numero maximo de hops desde la semilla. Default 3. */
  maxHops?: number
  /** Umbral: shares por debajo se descartan (no propagan ni acumulan).
   *  Default 0.5. */
  minActivation?: number
}

const DEFAULTS: Required<DiffusionOptions> = {
  seedActivation: 100,
  decayPerHop: 0.6,
  maxHops: 3,
  minActivation: 0.5,
}

interface Neighbor {
  neighbor: string  // nodeKey
  weight: number
}

/** Construye adyacencia NO-DIRIGIDA agregando pesos si el mismo par aparece en
 *  varias aristas (ej. dos deals entre A y B suman). Ignora self-loops. */
export function buildAdjacency(edges: TypedEdge[]): Map<string, Neighbor[]> {
  // Agregacion previa: par (a, b) => peso sumado, luego se transforma en Map.
  const agg = new Map<string, Map<string, number>>()
  const bump = (a: string, b: string, w: number): void => {
    let m = agg.get(a)
    if (!m) {
      m = new Map<string, number>()
      agg.set(a, m)
    }
    m.set(b, (m.get(b) ?? 0) + w)
  }
  for (const e of edges) {
    const src = nodeKey(e.srcType, e.srcId)
    const dst = nodeKey(e.dstType, e.dstId)
    if (src === dst) continue  // self-loop no propaga
    if (e.weight <= 0) continue // arista muerta
    bump(src, dst, e.weight)
    bump(dst, src, e.weight)  // simetrica
  }
  const out = new Map<string, Neighbor[]>()
  for (const [node, m] of agg) {
    const list: Neighbor[] = []
    for (const [neighbor, weight] of m) list.push({ neighbor, weight })
    // Orden estable por neighbor (deterministico para tests y snapshots).
    list.sort((a, b) => (a.neighbor < b.neighbor ? -1 : a.neighbor > b.neighbor ? 1 : 0))
    out.set(node, list)
  }
  return out
}

/** Ejecuta la difusion desde `seedNodeKey`. Devuelve Map<nodeKey, activacion>
 *  con el seed incluido. Si el seed no existe en el grafo, devuelve Map con
 *  solo el seed activado (para debuggear inputs). */
export function diffuse(
  graph: Graph,
  seedNodeKey: string,
  opts?: DiffusionOptions,
): Map<string, number> {
  const cfg = { ...DEFAULTS, ...(opts ?? {}) }
  const adj = buildAdjacency(graph.edges)

  const activation = new Map<string, number>()
  activation.set(seedNodeKey, cfg.seedActivation)

  let frontier = new Map<string, number>([[seedNodeKey, cfg.seedActivation]])
  for (let hop = 0; hop < cfg.maxHops; hop++) {
    const next = new Map<string, number>()
    for (const [node, energy] of frontier) {
      const neighbors = adj.get(node)
      if (!neighbors || neighbors.length === 0) continue
      const total = neighbors.reduce((s, n) => s + n.weight, 0)
      if (total <= 0) continue
      for (const n of neighbors) {
        const share = energy * (n.weight / total) * cfg.decayPerHop
        if (share < cfg.minActivation) continue
        next.set(n.neighbor, (next.get(n.neighbor) ?? 0) + share)
      }
    }
    if (next.size === 0) break
    for (const [node, e] of next) {
      activation.set(node, (activation.get(node) ?? 0) + e)
    }
    frontier = next
  }

  return activation
}

/** Devuelve las top-N entradas del Map de activacion ordenadas desc por energia.
 *  Excluye el seed por defecto (uno mismo no es señal interesante). */
export function topActivated(
  activation: Map<string, number>,
  seedNodeKey: string,
  limit: number,
): Array<{ nodeKey: string; activation: number }> {
  const rows: Array<{ nodeKey: string; activation: number }> = []
  for (const [k, v] of activation) {
    if (k === seedNodeKey) continue
    rows.push({ nodeKey: k, activation: v })
  }
  rows.sort((a, b) => {
    if (b.activation !== a.activation) return b.activation - a.activation
    // Desempate estable por nodeKey.
    return a.nodeKey < b.nodeKey ? -1 : 1
  })
  return rows.slice(0, limit)
}
