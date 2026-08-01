// SIR V2 — Mapa de influencia informal (16·M2).
//
// Base científica: inteligencia social — el organigrama miente; el poder real
// pasa por líderes informales, nodos y puentes (ver `docs/16` y `docs/15`).
// Para un objetivo con una persona (ej. el aumento con Alex), este motor arma un
// mapa de QUIÉN MÁS PESA alrededor de esa decisión, sobre lo que SIR ya tiene:
//   - el CÍRCULO de la decisión: gente del mismo org (org_group / organización);
//   - HUBS: los más conectados del grafo de vínculos (líderes informales);
//   - PUENTES: quienes conectan grupos distintos (te dan alcance);
//   - CONECTORES al objetivo: quiénes están linkeados a la persona objetivo.
//
// PURO y determinístico, corre client-side (grafo de personas + person_links del
// store). Honesto: el mapa vale lo que valen los vínculos que cargaste — si no
// hay grafo, lo dice y cae al círculo por org.

export interface InflPerson {
  id: string
  name: string
  importanceScore?: number
  orgGroup?: string | null
  organization?: string | null
  title?: string | null
}

/** Arista no dirigida persona↔persona. */
export interface InflLink { aId: string; bId: string }

export type InflRole = 'cohort' | 'connector' | 'hub' | 'bridge'

export interface InfluenceNode {
  id: string
  name: string
  role: InflRole
  reason: string
  degree: number
}

export interface InfluenceMap {
  targetName: string | null
  cohort: InfluenceNode[]
  connectors: InfluenceNode[]
  hubs: InfluenceNode[]
  bridges: InfluenceNode[]
  hasLinks: boolean
  note: string
}

function orgOf(p: InflPerson): string | null {
  const o = (p.orgGroup ?? p.organization ?? '').trim()
  return o || null
}

interface BuildArgs {
  people: InflPerson[]
  links: InflLink[]
  targetId?: string | null
}

/**
 * Arma el mapa de influencia alrededor de un objetivo. Determinístico.
 * Si `targetId` no está o no existe, devuelve solo hubs/puentes generales.
 */
export function buildInfluenceMap({ people, links, targetId }: BuildArgs): InfluenceMap {
  const byId = new Map(people.map((p) => [p.id, p]))
  const target = targetId ? byId.get(targetId) ?? null : null

  // Grado + adyacencia (no dirigido, ignora self-loops y aristas colgadas).
  const degree = new Map<string, number>()
  const adj = new Map<string, Set<string>>()
  for (const l of links) {
    if (l.aId === l.bId) continue
    if (!byId.has(l.aId) || !byId.has(l.bId)) continue
    degree.set(l.aId, (degree.get(l.aId) ?? 0) + 1)
    degree.set(l.bId, (degree.get(l.bId) ?? 0) + 1)
    if (!adj.has(l.aId)) adj.set(l.aId, new Set())
    if (!adj.has(l.bId)) adj.set(l.bId, new Set())
    adj.get(l.aId)!.add(l.bId)
    adj.get(l.bId)!.add(l.aId)
  }
  const hasLinks = degree.size > 0
  const deg = (id: string) => degree.get(id) ?? 0

  const node = (p: InflPerson, role: InflRole, reason: string): InfluenceNode => ({
    id: p.id, name: p.name, role, degree: deg(p.id), reason,
  })

  // CÍRCULO de la decisión: mismo org que el objetivo, ordenado por importancia.
  const cohort: InfluenceNode[] = []
  const targetOrg = target ? orgOf(target) : null
  if (target && targetOrg) {
    const mates = people
      .filter((p) => p.id !== target.id && orgOf(p) === targetOrg)
      .sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0))
      .slice(0, 6)
    for (const p of mates) cohort.push(node(p, 'cohort', p.title ? `${p.title} · mismo entorno` : 'mismo entorno'))
  }

  // CONECTORES: adyacentes al objetivo en el grafo (quién podría introducir/incidir).
  const connectors: InfluenceNode[] = []
  if (target) {
    const neigh = [...(adj.get(target.id) ?? [])]
      .map((id) => byId.get(id))
      .filter((p): p is InflPerson => !!p)
      .sort((a, b) => deg(b.id) - deg(a.id))
      .slice(0, 6)
    for (const p of neigh) connectors.push(node(p, 'connector', `conectado con ${target.name}`))
  }

  // HUBS: los más conectados del grafo (líderes informales por conectividad).
  const hubs: InfluenceNode[] = people
    .filter((p) => deg(p.id) > 0 && p.id !== target?.id)
    .sort((a, b) => deg(b.id) - deg(a.id))
    .slice(0, 5)
    .map((p) => node(p, 'hub', `${deg(p.id)} vínculo${deg(p.id) === 1 ? '' : 's'} en tu red`))

  // PUENTES: sus vecinos abarcan ≥2 orgs distintas → conectan mundos separados.
  const bridges: InfluenceNode[] = []
  for (const p of people) {
    const neigh = adj.get(p.id)
    if (!neigh || neigh.size < 2) continue
    const orgs = new Set<string>()
    const own = orgOf(p)
    if (own) orgs.add(own)
    for (const nId of neigh) { const o = orgOf(byId.get(nId) ?? {} as InflPerson); if (o) orgs.add(o) }
    if (orgs.size >= 2) bridges.push(node(p, 'bridge', `conecta ${orgs.size} entornos distintos`))
  }
  bridges.sort((a, b) => b.degree - a.degree)

  return {
    targetName: target?.name ?? null,
    cohort,
    connectors,
    hubs,
    bridges: bridges.slice(0, 5),
    hasLinks,
    note: buildNote({ hasLinks, hasTarget: !!target, hasCohort: cohort.length > 0, hasConnectors: connectors.length > 0 }),
  }
}

function buildNote(x: { hasLinks: boolean; hasTarget: boolean; hasCohort: boolean; hasConnectors: boolean }): string {
  if (x.hasTarget && !x.hasConnectors && !x.hasCohort && !x.hasLinks) {
    return 'Todavía no tengo grafo ni entorno cargado de esta persona — carga con quién se relaciona (vínculos) y su org para trazar el camino real. El organigrama formal no basta.'
  }
  const parts: string[] = []
  if (x.hasConnectors) parts.push('quién está conectado con la persona')
  if (x.hasCohort) parts.push('quién más está en su entorno')
  if (!x.hasLinks) parts.push('(sin vínculos cargados, el mapa se apoya solo en el org)')
  return `El mapa vale lo que valen los datos que cargaste: ${parts.join(', ') || 'aún es parcial'}. Es una pista de por dónde pasa la influencia real, no un veredicto.`
}
