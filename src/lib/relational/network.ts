// SIR V2 — Inteligencia de red (15·7). Confianza: media (depende de qué tan
// poblado esté el grafo).
//
// Sobre el grafo person↔person (person_links, ahora con aristas profesionales/
// sociales del capturador 0128), tres cosas honestas:
//   (a) CAMINOS: "quieres llegar a X; conocés a Y que lo conoce" — mutuos que
//       puentean hacia una persona objetivo, rankeados por qué tan buen puente son.
//   (b) PRESENTACIONES: dos personas tuyas que NO están conectadas pero comparten
//       organización → una intro de valor que podrías hacer tú.
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
  /** 0-10; proxy de cuánto "pull"/cercanía tienes con esa persona. */
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
 * pero NO están conectadas por una arista. Una intro que podrías hacer tú.
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

// ─── LAZOS DÉBILES (Granovetter, extensión de 15·7) ──────────────────────────
// "The strength of weak ties": los CONOCIDOS (no los íntimos) son los que abren
// puertas NUEVAS, porque te conectan a otros círculos. Para un objetivo abierto,
// resalta los lazos débiles (capas network/peripheral) cuyo DOMINIO (rol/org/tags)
// matchea el objetivo — un contacto lejano que podría abrir una puerta. Honesto:
// solo aparece con un match real de dominio; sin señal, no inventa.

export interface WeakTiePerson {
  id: string
  name: string
  /** PersonCategory: 'inner_circle' | 'close' | 'network' | 'peripheral'. */
  category: string
  title?: string | null
  organization?: string | null
  tags?: string[]
  importance?: number
}

export interface WeakTie {
  personId: string
  name: string
  category: string
  /** Palabras del objetivo que matchean el dominio de la persona. */
  overlap: string[]
  reason: string
}

/** Capas "débiles" en el sentido de Granovetter (conocidos, no íntimos). */
const WEAK_LAYERS = new Set(['network', 'peripheral'])

// Stopwords ES para no matchear por palabras vacías.
const STOP = new Set([
  'para', 'con', 'como', 'una', 'uno', 'los', 'las', 'del', 'que', 'por', 'mas',
  'este', 'esta', 'ser', 'estar', 'tener', 'hacer', 'mi', 'tu', 'su', 'el', 'la',
  'de', 'en', 'un', 'and', 'the', 'for', 'sobre', 'entre', 'desde', 'hasta', 'año',
])

function fold(s: string): string {
  const map: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }
  return s.replace(/[A-ZÁÉÍÓÚÜÑ]/g, (c) => c.toLowerCase()).replace(/[áéíóúüñ]/g, (c) => map[c] ?? c)
}

function tokens(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOP.has(t))
}

/**
 * Lazos débiles relevantes a un objetivo: conocidos (network/peripheral) cuyo
 * dominio (título/org/tags) comparte alguna palabra significativa con el objetivo.
 * Rankeados por cantidad de match, luego importancia. PURO.
 */
export function weakTiesForGoal(
  goalTitle: string,
  people: WeakTiePerson[],
  opts?: { limit?: number },
): WeakTie[] {
  const limit = opts?.limit ?? 5
  const goalTokens = new Set(tokens(goalTitle))
  if (goalTokens.size === 0) return []

  const out: WeakTie[] = []
  for (const p of people) {
    if (!WEAK_LAYERS.has(p.category)) continue
    const blob = [p.title ?? '', p.organization ?? '', ...(p.tags ?? [])].join(' ')
    const personTokens = new Set(tokens(blob))
    const overlap = [...goalTokens].filter((t) => personTokens.has(t))
    if (overlap.length === 0) continue
    const layer = p.category === 'peripheral' ? 'periferia' : 'red'
    // Nombrá lo que REALMENTE matcheó (no la org): honesto sobre por qué aparece.
    const shared = overlap.slice(0, 3).map((w) => `"${w}"`).join(', ')
    const org = p.organization ? ` (${p.organization})` : ''
    out.push({
      personId: p.id,
      name: p.name,
      category: p.category,
      overlap,
      reason: `Contacto lejano (${layer})${org} que comparte ${shared} con tu objetivo. Justo esos lazos débiles son los que abren puertas nuevas.`,
    })
  }

  const imp = new Map(people.map((p) => [p.id, p.importance ?? 4]))
  out.sort((a, b) => (b.overlap.length - a.overlap.length) || (imp.get(b.personId)! - imp.get(a.personId)!))
  return out.slice(0, limit)
}
