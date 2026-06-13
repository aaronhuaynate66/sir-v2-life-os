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
import { resolveOrgGroup } from './orgRegistry'

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
  // Sin grupo explícito: intentar resolverlo desde el empleador vía el registro
  // (ej. organization "K2 Seguridad y Resguardo" → grupo "Grupo HNG"). Así la
  // red se enciende con solo tener la empresa, sin tipear el grupo a mano.
  const resolved = resolveOrgGroup(p.organization)
  if (resolved) return normalizeOrgKey(resolved)
  return normalizeOrgKey(p.organization)
}

/** ¿Dos personas comparten red profesional? Falso si alguna no declara org. */
export function sharesProfessionalOrg(a: OrgBearer, b: OrgBearer): boolean {
  const ka = orgJoinKey(a)
  const kb = orgJoinKey(b)
  return ka !== '' && ka === kb
}

/** Días hasta el próximo cumpleaños (aniversario de mes/día) desde `now`.
 *  null si no hay fecha válida. 0 = es hoy. Aproximación en fecha local; un
 *  desfase de ±1 día en el borde de medianoche es tolerable para un hint. */
export function daysUntilNextBirthday(
  birthDate: string | null | undefined,
  now: Date,
): number | null {
  if (typeof birthDate !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate)
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(now.getFullYear(), month - 1, day)
  if (next.getTime() < today.getTime()) next = new Date(now.getFullYear() + 1, month - 1, day)
  return Math.round((next.getTime() - today.getTime()) / 86_400_000)
}

/** Etiqueta legible del grupo/holding de una persona, para el nodo-empresa del
 *  grafo. Prefiere org_group explícito; si no, el grupo resuelto por el registro
 *  (ej. organization "K2…" → "Grupo HNG"); si no, la empresa. '' si no hay nada. */
export function orgGroupLabel(p: OrgBearer): string {
  const group = (p.orgGroup ?? '').trim()
  if (group) return group
  const resolved = resolveOrgGroup(p.organization)
  if (resolved) return resolved
  return (p.organization ?? '').trim()
}

export interface NetworkPerson extends OrgBearer {
  id: string
  name: string
  /** importanceScore 1-10 (jerarquía). Opcional. */
  importance?: number
  /** Fecha de nacimiento (YYYY-MM-DD) para timing de cumpleaños. */
  birthDate?: string | null
  /** Último contacto registrado (YYYY-MM-DD). */
  lastContact?: string | null
  /** Score del vínculo 0-100 (último snapshot). */
  relScore?: number
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
  /** Estado del vínculo (para calibrar a quién/cómo apoyarse + timing). */
  birthDate?: string | null
  lastContact?: string | null
  relScore?: number
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
      birthDate: p.birthDate ?? null,
      lastContact: p.lastContact ?? null,
      relScore: p.relScore,
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
