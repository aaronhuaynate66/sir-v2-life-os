// SIR V2 — Red profesional: deriva conexiones entre personas a partir de su
// organización estructurada (migration 0072).
//
// REGLA DE UNIÓN: dos personas están profesionalmente conectadas si comparten
// `orgGroup` (el holding/grupo) — o, si ninguna tiene grupo, si comparten
// `organization` (el empleador). org_group es la clave del holding: Alex
// (Grupo HNG) y Francisco (K2, grupo Grupo HNG) quedan conectados aunque sus
// empresas específicas difieran.
//
// Todo PURO y testeable. Sin efectos. Los consumidores (grafo, briefing) le
// pasan las personas ya cargadas.

/** Normaliza una clave de organización para comparar: trim + lower + colapsa
 *  espacios. Devuelve '' si no hay valor usable. */
export function normalizeOrgKey(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface OrgBearer {
  organization?: string | null
  orgGroup?: string | null
}

/** La clave de unión efectiva de una persona: grupo si existe, si no empresa.
 *  '' = sin pertenencia declarada (no conecta con nadie). */
export function orgJoinKey(p: OrgBearer): string {
  const group = normalizeOrgKey(p.orgGroup)
  if (group) return group
  return normalizeOrgKey(p.organization)
}

/** ¿Dos personas comparten red profesional? Falso si alguna no declara org. */
export function sharesProfessionalOrg(a: OrgBearer, b: OrgBearer): boolean {
  const ka = orgJoinKey(a)
  const kb = orgJoinKey(b)
  return ka !== '' && ka === kb
}

export interface NetworkPerson extends OrgBearer {
  id: string
  name: string
  /** importanceScore 1-10 (jerarquía). Opcional. */
  importance?: number
}

export interface ColleagueContext {
  id: string
  name: string
  organization?: string | null
  orgGroup?: string | null
  importance?: number
  /** Título de un objetivo activo del usuario que involucra a esta persona,
   *  si lo hay. Señal de que ya hay una agenda en juego con el colega. */
  activeGoalTitle?: string
}

/**
 * Colegas de `target` dentro de `all` (misma red profesional, excluyéndola a
 * ella). Ordenados por importancia desc. `goalByPerson` mapea personId → título
 * de objetivo activo (para marcar dónde ya hay agenda). `limit` acota el ruido.
 */
export function findColleagues(
  target: NetworkPerson,
  all: NetworkPerson[],
  goalByPerson: Record<string, string> = {},
  limit = 5,
): ColleagueContext[] {
  if (orgJoinKey(target) === '') return []
  return all
    .filter((p) => p.id !== target.id && sharesProfessionalOrg(target, p))
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      name: p.name,
      organization: p.organization ?? null,
      orgGroup: p.orgGroup ?? null,
      importance: p.importance,
      activeGoalTitle: goalByPerson[p.id],
    }))
}

/** Pares conectados (ids) para el grafo: toda combinación de personas que
 *  comparten red profesional. Dedupe por par no ordenado. Acotado por `maxPairs`
 *  para no explotar visualmente en grupos grandes. */
export function professionalPairs(
  people: NetworkPerson[],
  maxPairs = 60,
): Array<{ a: string; b: string; orgKey: string }> {
  const out: Array<{ a: string; b: string; orgKey: string }> = []
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      if (out.length >= maxPairs) return out
      const ka = orgJoinKey(people[i])
      if (ka !== '' && ka === orgJoinKey(people[j])) {
        out.push({ a: people[i].id, b: people[j].id, orgKey: ka })
      }
    }
  }
  return out
}
