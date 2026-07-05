// SIR V2 — Inteligencia de red (15·7). Confianza: media (depende de qué tan
// poblado esté el grafo).
//
// Sobre el grafo person↔person (person_links, ahora con aristas profesionales/
// sociales del capturador 0128), tres cosas honestas:
//   (a) CAMINOS: "querés llegar a X; conocés a Y que lo conoce" — mutuos que
//       puentean hacia una persona objetivo, rankeados por qué tan buen puente son.
//   (b) PRESENTACIONES: dos personas tuyas que NO están conectadas pero comparten
//       organización → una intro de valor que podrías hacer vos.
// Lazos débiles (Granovetter) para un objetivo: se deja para cuando el rubro del
// objetivo se cruce con roles — acá el foco es lo que el grafo ya sostiene.
//
// PURO y determinístico. Honesto: sin aristas, no inventa caminos (devuelve vacío).

export interface NetEdge {
  aId: string
  bId: string
  weight?: number | null
}

export interface NetPerson {
  id: string
  name: string
  /** 0-10; proxy de cuánto "pull"/cercanía tenés con esa persona. */
  importance?: number
  organization?: string | null
}

export interface Bridge {
  /** El mutuo que conecta con el objetivo. */
  viaId: string
  viaName: string
  /** Qué tan buen puente es (cercanía tuya con el mutuo + peso de la arista). */
  strength: number
  /** Contexto de la arista mutuo↔objetivo, si se declaró. */
  edgeWeight: number | null
}

const DEFAULT_IMPORTANCE = 4

/** Vecinos directos de `personId` en el grafo (cualquier categoría de arista). */
function neighborsOf(edges: NetEdge[], personId: string): Map<string, number | null> {
  const out = new Map<string, number | null>()
  for (const e of edges) {
    if (e.aId === personId) out.set(e.bId, e.weight ?? null)
    else if (e.bId === personId) out.set(e.aId, e.weight ?? null)
  }
  return out
}

/**
 * Caminos hacia una persona objetivo: los mutuos que la conocen, rankeados por
 * qué tan buen puente son (tu cercanía con el mutuo + el peso declarado de la
 * arista). Excluye al propio objetivo y al self. PURO.
 */
export function findBridges(
  edges: NetEdge[],
  peopleById: Map<string, NetPerson>,
  targetId: string,
  opts?: { limit?: number; selfId?: string },
): Bridge[] {
  const limit = opts?.limit ?? 5
  const selfId = opts?.selfId ?? 'self'
  const neigh = neighborsOf(edges, targetId)
  const bridges: Bridge[] = []
  for (const [viaId, w] of neigh) {
    if (viaId === targetId || viaId === selfId) continue
    const via = peopleById.get(viaId)
    if (!via) continue
    const importance = via.importance ?? DEFAULT_IMPORTANCE
    const strength = importance + (w ?? 0)
    bridges.push({ viaId, viaName: via.name, strength: Math.round(strength * 10) / 10, edgeWeight: w ?? null })
  }
  bridges.sort((a, b) => b.strength - a.strength)
  return bridges.slice(0, limit)
}

export interface IntroSuggestion {
  aId: string
  aName: string
  bId: string
  bName: string
  /** Por qué tendría sentido presentarlos. */
  reason: string
}

function normOrg(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

/**
 * Presentaciones de valor: pares de personas tuyas que comparten organización
 * pero NO están conectadas por una arista. Una intro que podrías hacer vos.
 * PURO. Devuelve como mucho `limit`, priorizando por importancia combinada.
 */
export function suggestIntroductions(
  edges: NetEdge[],
  people: NetPerson[],
  opts?: { limit?: number },
): IntroSuggestion[] {
  const limit = opts?.limit ?? 8
  // Set de pares ya conectados (no dirigido).
  const linked = new Set<string>()
  for (const e of edges) linked.add(pairKey(e.aId, e.bId))

  // Agrupar por organización normalizada.
  const byOrg = new Map<string, NetPerson[]>()
  for (const p of people) {
    const org = normOrg(p.organization)
    if (!org) continue
    const arr = byOrg.get(org) ?? []
    arr.push(p)
    byOrg.set(org, arr)
  }

  const out: IntroSuggestion[] = []
  for (const [, group] of byOrg) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        if (linked.has(pairKey(a.id, b.id))) continue
        out.push({
          aId: a.id, aName: a.name, bId: b.id, bName: b.name,
          reason: `Ambos en ${a.organization} y no figuran conectados.`,
        })
      }
    }
  }
  // Priorizar por importancia combinada (intros entre gente que te importa).
  const imp = new Map(people.map((p) => [p.id, p.importance ?? DEFAULT_IMPORTANCE]))
  out.sort((x, y) => (imp.get(y.aId)! + imp.get(y.bId)!) - (imp.get(x.aId)! + imp.get(x.bId)!))
  return out.slice(0, limit)
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}
