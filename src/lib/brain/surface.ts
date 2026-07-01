// SIR V2 — Cerebro F4 · Surfacing (traer lo encendido al lugar de uso).
//
// Toma el grafo y un contexto (¿que estamos mirando ahora?) y elige un nodo
// SEMILLA para difundir. Devuelve las filas "encendidas" con label + razon
// (que arista mas fuerte las conecta con la semilla). Puro: la fuente de
// verdad es el grafo + contexto, no una LLM ni una tabla de estados.
//
// Que decide y que NO:
//  - Elige la semilla del contexto siguiendo prioridad: nextGoalId > anchorGoalId
//    > primer goal del grafo. Si ni asi hay goal, devuelve `null` (no forzamos).
//  - Traduce nodeKey a `type:id` y agrega label + "razon" (kind de la arista
//    mas pesada directamente conectada a la semilla que apunta al nodo).
//  - NO afirma estados ajenos. NO ordena hacer nada. Solo lista lo activado
//    con "por [tipo de conexion]". El uso final es passivo — surfacing, no
//    feed.

import { diffuse, topActivated, type DiffusionOptions } from './diffuse'
import { nodeKey, type EdgeKind, type Graph, type NodeType } from './types'

export interface SurfacingContext {
  /** Id del proximo hito/goal segun agenda (mayor prioridad si existe). */
  nextGoalId?: string | null
  /** Id del goal ancla del ano (fallback si nextGoalId no viene). */
  anchorGoalId?: string | null
}

export interface GlowRow {
  nodeKey: string
  type: NodeType
  id: string
  label: string
  activation: number
  /** Kind de la arista MAS PESADA directamente conectada al seed que llega a
   *  este nodo. Si no hay arista directa, `null` (venia de un hop >= 2). */
  reason: EdgeKind | null
}

export interface GlowResult {
  seedNodeKey: string
  seedLabel: string
  rows: GlowRow[]
}

/** Elige la semilla desde el contexto siguiendo prioridad. Devuelve nodeKey
 *  o null si ningun goal del contexto existe en el grafo (y no hay goal alguno). */
export function pickSeedForContext(
  ctx: SurfacingContext,
  graph: Graph,
): string | null {
  const goalIds = new Set(graph.nodes.filter((n) => n.type === 'goal').map((n) => n.id))
  if (ctx.nextGoalId && goalIds.has(ctx.nextGoalId)) {
    return nodeKey('goal', ctx.nextGoalId)
  }
  if (ctx.anchorGoalId && goalIds.has(ctx.anchorGoalId)) {
    return nodeKey('goal', ctx.anchorGoalId)
  }
  // Fallback: primer goal del grafo (orden estable). Si no hay ninguno, null.
  const firstGoal = graph.nodes.find((n) => n.type === 'goal')
  return firstGoal ? nodeKey('goal', firstGoal.id) : null
}

/** Corre difusion + arma filas con label y "por que". `limit` acota el output.
 *  Si el seed no existe en el grafo, devuelve `null` (llamador puede omitir). */
export function describeGlow(
  graph: Graph,
  seedNodeKey: string,
  limit: number,
  diffusionOpts?: DiffusionOptions,
): GlowResult | null {
  const seedNode = graph.nodes.find((n) => nodeKey(n.type, n.id) === seedNodeKey)
  if (!seedNode) return null

  const activation = diffuse(graph, seedNodeKey, diffusionOpts)
  const top = topActivated(activation, seedNodeKey, limit)

  // Mapa label por nodeKey.
  const labelByKey = new Map<string, string>()
  for (const n of graph.nodes) labelByKey.set(nodeKey(n.type, n.id), n.label)

  // Para el `reason`: la arista con peso MAXIMO que conecta directo seed↔node.
  // Recorremos aristas una sola vez indexando por vecino-del-seed.
  const directEdgeByNeighbor = new Map<string, { kind: EdgeKind; weight: number }>()
  for (const e of graph.edges) {
    const src = nodeKey(e.srcType, e.srcId)
    const dst = nodeKey(e.dstType, e.dstId)
    if (src === dst) continue
    let neighbor: string | null = null
    if (src === seedNodeKey) neighbor = dst
    else if (dst === seedNodeKey) neighbor = src
    if (!neighbor) continue
    const prev = directEdgeByNeighbor.get(neighbor)
    if (!prev || e.weight > prev.weight) {
      directEdgeByNeighbor.set(neighbor, { kind: e.kind, weight: e.weight })
    }
  }

  const rows: GlowRow[] = top.map((r) => {
    const [type, ...rest] = r.nodeKey.split(':') as [NodeType, ...string[]]
    const id = rest.join(':')  // por si el id tiene ":" dentro
    const direct = directEdgeByNeighbor.get(r.nodeKey)
    return {
      nodeKey: r.nodeKey,
      type,
      id,
      label: labelByKey.get(r.nodeKey) ?? id,
      activation: r.activation,
      reason: direct?.kind ?? null,
    }
  })

  return {
    seedNodeKey,
    seedLabel: seedNode.label,
    rows,
  }
}
