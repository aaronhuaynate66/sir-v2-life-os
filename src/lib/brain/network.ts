// SIR V2 — Cerebro · Puente RED/CONEXIONES para el chat (askSir).
//
// SIR (el chat) era CIEGO al grafo tipado del cerebro (src/lib/brain/*): un
// grafo con pesos, proyectado de ~14 tablas, que el chat nunca consultaba. Por
// eso negaba poder navegar la RED de Aaron ("¿quién de mi red conoce a alguien
// en X?", "¿quién me presenta a Y?", "¿quién está más cerca de un objetivo?").
//
// Este módulo es PURO (sin infra, testeable):
//   - `isNetworkQuery()`   — detección de intención de red/caminos.
//   - `resolveNetworkSeeds()` — de la pregunta + los nodos del grafo, saca las
//      SEMILLAS (personas/orgs/objetivos nombrados) desde donde difundir.
//   - `renderNetworkBlock()` — arma el bloque "== RED / CONEXIONES ==" con marco
//      honesto (es tu grafo derivado de tu data, no adivinación).
//
// La carga del grafo (scopedLoader) y la difusión (diffuse/describeGlow) viven
// aparte; askSir las orquesta SOLO cuando isNetworkQuery es true y acotado.

import type { EdgeKind, Graph, NodeType } from './types'
import { nodeKey } from './types'
import { diffuse, type DiffusionOptions } from './diffuse'
import { EDGE_REASON_LABEL, NODE_TYPE_LABEL } from './explore'

// ─── Detección de intención ──────────────────────────────────────────────────
/** Normaliza: minúsculas, sin tildes. */
function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Keywords distintivas de preguntas de RED / CAMINOS. Se buscan como substring
// sobre el texto normalizado. Elegidas para no pisar preguntas normales de
// "¿cómo está X?" (esas van por otros bloques).
const NETWORK_KW = [
  'quien conoce', 'conoce a alguien', 'conoce a gente', 'conocen a',
  'me presenta', 'me puede presentar', 'me podria presentar', 'presentarme',
  'presentar a', 'quien me conecta', 'quien me conectaria',
  'conectado con', 'conectada con', 'conectado a', 'conectada a',
  'mas conectado', 'mas conectada', 'quien esta conectado', 'quien esta mas conectad',
  'mi red', 'red de contactos', 'en mi red', 'de mi red',
  'acercarme a', 'acercarme al', 'acercarme', 'acercar a', 'me acerca a',
  'quien tengo para', 'quien tengo cerca', 'cerca de mi objetivo', 'cerca del objetivo',
  'quien me puede ayudar a acercar', 'quien me podria ayudar a acercar',
  'quien me ayuda a llegar', 'quien me acerca',
  'lazos debiles', 'lazo debil', 'lazos fuertes', 'lazos',
  'en que empresa esta', 'en que empresa trabaja', 'quien trabaja en', 'quien esta en',
  'quien conozco en', 'a quien conozco en', 'contacto en',
  'puente hacia', 'intermediario', 'quien me da acceso', 'quien me abre la puerta',
  'camino hacia', 'camino a', 'como llego a',
  'conexiones de', 'conexiones con', 'quienes se conocen',
] as const

/** ¿La pregunta es de RED / CAMINOS (quién conoce a quién, quién me presenta,
 *  quién está cerca de un objetivo)? PURA. */
export function isNetworkQuery(question: string): boolean {
  const q = norm(question)
  return NETWORK_KW.some((k) => q.includes(k))
}

// ─── Resolución de semillas ────────────────────────────────────────────────
/** Una semilla del grafo desde la que difundir (con su etiqueta humana). */
export interface NetworkSeed {
  nodeKey: string
  type: NodeType
  label: string
}

/** ¿El label (normalizado) del nodo aparece en la pregunta? Reglas (en orden):
 *   1. el label completo es substring de la pregunta;
 *   2. >= 2 tokens LARGOS (>=4) del label aparecen (ej. "Sienna Minerals" matchea
 *      "Sienna Minerals S.A.C." aunque el sufijo "S.A.C." no esté en la pregunta);
 *   3. el label tiene un solo token largo y distintivo (>=5) que aparece (ej.
 *      "Grupo HNG" → "grupo").
 *  Conservador para no arrastrar nodos por un token corto/común. */
function labelMentioned(qNorm: string, label: string): boolean {
  const nl = norm(label).trim()
  if (nl.length < 3) return false
  if (nl.length >= 4 && qNorm.includes(nl)) return true // 1
  const longTokens = nl.split(/\s+/).filter((t) => t.length >= 4)
  if (longTokens.length === 0) return false
  const matched = longTokens.filter((t) => qNorm.includes(t))
  if (matched.length >= 2) return true // 2
  // 3: label de un solo token largo, y ese token es distintivo (>=5).
  if (longTokens.length === 1 && matched.length === 1 && longTokens[0].length >= 5) return true
  return false
}

/**
 * Resuelve las SEMILLAS de la difusión desde la pregunta + los nodos del grafo.
 *  - `extraPersonIds`: ids de personas que askSir ya resolvió (por nombre,
 *    parentesco o scope) — entran como semilla aunque el matcher de labels no
 *    las cace (más robusto que re-derivarlas acá).
 *  - Además matchea labels de person/org/goal nombrados literalmente.
 * Devuelve semillas únicas por nodeKey, acotadas a `max`. PURA.
 */
export function resolveNetworkSeeds(
  question: string,
  graph: Graph,
  extraPersonIds: readonly string[] = [],
  max = 6,
): NetworkSeed[] {
  const qNorm = norm(question)
  const byKey = new Map<string, NetworkSeed>()
  const nodeByKey = new Map<string, { type: NodeType; id: string; label: string }>()
  for (const n of graph.nodes) nodeByKey.set(nodeKey(n.type, n.id), n)

  // 1. Personas ya resueltas por askSir.
  for (const pid of extraPersonIds) {
    const k = nodeKey('person', pid)
    const node = nodeByKey.get(k)
    if (node && !byKey.has(k)) byKey.set(k, { nodeKey: k, type: 'person', label: node.label })
  }

  // 2. Labels de person/org/goal nombrados literalmente en la pregunta.
  for (const n of graph.nodes) {
    if (n.type !== 'person' && n.type !== 'org' && n.type !== 'goal') continue
    const k = nodeKey(n.type, n.id)
    if (byKey.has(k)) continue
    if (labelMentioned(qNorm, n.label)) {
      byKey.set(k, { nodeKey: k, type: n.type, label: n.label })
    }
  }

  return [...byKey.values()].slice(0, max)
}

// ─── Construcción de conexiones (difusión multi-semilla) ───────────────────
/**
 * Corre difusión desde CADA semilla y combina: la activación de un nodo es la
 * SUMA de lo que le llegó desde todas las semillas (los caminos múltiples
 * refuerzan). Para el "por qué" (reason/peso) toma la arista DIRECTA más pesada
 * que conecte cualquier semilla con el nodo. Excluye del ranking a las propias
 * semillas. Ordena desc por activación (desempate estable por nodeKey).
 * Devuelve top-`limit` NetworkConnection. PURA (sin infra).
 */
export function buildNetworkConnections(
  graph: Graph,
  seeds: readonly NetworkSeed[],
  limit = 12,
  diffusionOpts?: DiffusionOptions,
): NetworkConnection[] {
  if (seeds.length === 0) return []
  const seedKeys = new Set(seeds.map((s) => s.nodeKey))

  // Activación combinada.
  const combined = new Map<string, number>()
  for (const seed of seeds) {
    const act = diffuse(graph, seed.nodeKey, diffusionOpts)
    for (const [k, v] of act) {
      if (seedKeys.has(k)) continue // el propio ancla no es señal
      combined.set(k, (combined.get(k) ?? 0) + v)
    }
  }
  if (combined.size === 0) return []

  // Arista directa más pesada seed↔nodo (para reason + peso).
  const directByNode = new Map<string, { kind: EdgeKind; weight: number }>()
  for (const e of graph.edges) {
    const src = nodeKey(e.srcType, e.srcId)
    const dst = nodeKey(e.dstType, e.dstId)
    if (src === dst) continue
    let neighbor: string | null = null
    if (seedKeys.has(src)) neighbor = dst
    else if (seedKeys.has(dst)) neighbor = src
    if (!neighbor || seedKeys.has(neighbor)) continue
    const prev = directByNode.get(neighbor)
    if (!prev || e.weight > prev.weight) directByNode.set(neighbor, { kind: e.kind, weight: e.weight })
  }

  // Labels por nodeKey.
  const labelByKey = new Map<string, string>()
  for (const n of graph.nodes) labelByKey.set(nodeKey(n.type, n.id), n.label)

  const rows = [...combined.entries()]
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : (a[0] < b[0] ? -1 : 1)))
    .slice(0, limit)
    .map(([k, activation]): NetworkConnection => {
      const [type, ...rest] = k.split(':') as [NodeType, ...string[]]
      const id = rest.join(':')
      const direct = directByNode.get(k)
      return {
        label: labelByKey.get(k) ?? id,
        type,
        reason: direct ? EDGE_REASON_LABEL[direct.kind] : 'conectado indirectamente (varios saltos)',
        weight: direct ? direct.weight : null,
        activation,
      }
    })
  return rows
}

// ─── Render del bloque ────────────────────────────────────────────────────
/** Una conexión encendida alrededor de las semillas. */
export interface NetworkConnection {
  label: string
  type: NodeType
  /** "Por qué" legible de la arista directa más pesada al seed (o indirecto). */
  reason: string
  /** Peso de esa arista directa (null si la conexión es indirecta, hop >= 2). */
  weight: number | null
  /** Energía de difusión acumulada (fuerza total de la conexión). */
  activation: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Arma el bloque "== RED / CONEXIONES ==" para el prompt. Marco honesto: es el
 * grafo DERIVADO de la data de Aaron (con pesos), no una adivinación. Agrupa las
 * conexiones por tipo de nodo, preservando el orden (vienen ordenadas desc por
 * activación). Devuelve '' si no hay semillas ni conexiones. PURO.
 */
export function renderNetworkBlock(
  seeds: NetworkSeed[],
  connections: NetworkConnection[],
): string {
  if (seeds.length === 0 && connections.length === 0) return ''
  const lines: string[] = [
    '== RED / CONEXIONES (tu grafo de conexiones DERIVADO de tu data — con pesos; NO es adivinación) ==',
  ]

  if (seeds.length > 0) {
    const seedTxt = seeds.map((s) => `${s.label} (${nodeTypeSingular(s.type)})`).join(', ')
    lines.push(`Ancla(s) de la pregunta: ${seedTxt}.`)
  }

  if (connections.length === 0) {
    lines.push('No hay nodos conectados por encima del umbral a esa(s) ancla(s) en tu grafo.')
    return lines.join('\n')
  }

  lines.push('Nodos más conectados a esa(s) ancla(s) (orden por fuerza de conexión):')
  // Agrupar por tipo preservando orden de aparición.
  const order: NodeType[] = []
  const byType = new Map<NodeType, NetworkConnection[]>()
  for (const c of connections) {
    if (!byType.has(c.type)) { byType.set(c.type, []); order.push(c.type) }
    byType.get(c.type)!.push(c)
  }
  for (const type of order) {
    lines.push(`  ${NODE_TYPE_LABEL[type]}:`)
    for (const c of byType.get(type)!) {
      const strength = c.weight != null
        ? `${c.reason}, peso ${round1(c.weight)}`
        : `${c.reason}` // indirecta: sin arista directa
      lines.push(`   - ${c.label} — ${strength} · fuerza de conexión ${round1(c.activation)}`)
    }
  }
  lines.push(
    'Léelo como caminos posibles en TU red: para "quién me presenta / quién está cerca de X" usa a los más conectados como puente. Si algo no está en el grafo, dilo — no inventes vínculos.',
  )
  return lines.join('\n')
}

/** Etiqueta singular corta por tipo (para el ancla). */
function nodeTypeSingular(type: NodeType): string {
  switch (type) {
    case 'person': return 'persona'
    case 'goal': return 'objetivo'
    case 'org': return 'empresa'
    case 'moment': return 'episodio'
    case 'deal': return 'oportunidad'
    case 'step': return 'tarea'
    case 'tracker': return 'seguimiento'
  }
}
