// SIR V2 — Ficha de empresa/holding (escalón 3). Modelo PURO computado desde la
// gente del usuario + el registro de organizaciones. DOBLE NIVEL:
//   - 'grupo'  : un holding (ej. Grupo HNG) → su gente (todas las filiales) +
//                las empresas que agrupa (sub-empresas) + objetivos.
//   - 'empresa': un empleador específico (ej. K2) → su gente + el holding al que
//                pertenece (parent) + objetivos.
//
// NO es una pseudo-persona: la empresa es CONTEXTO/tablero (gente, objetivos,
// estructura), sin score ni briefing afectivo.

import { generateSlug } from './slug'
import { orgJoinKey, orgGroupLabel, normalizeOrgKey } from './professionalNetwork'

export interface HubPerson {
  id: string
  name: string
  slug: string | null
  organization?: string | null
  orgGroup?: string | null
  importance?: number
  lastContact?: string | null
}

export interface HubGoal {
  title: string
  personIds: string[]
}

export interface HubLink {
  label: string
  slug: string
  count?: number
}

export interface CompanyHubModel {
  found: boolean
  level: 'grupo' | 'empresa'
  label: string
  /** Para 'empresa': el holding al que pertenece (si se conoce). */
  parentGroup?: HubLink
  /** Para 'grupo': las empresas (empleadores) donde conocés gente. */
  subCompanies: HubLink[]
  people: HubPerson[]
  goals: Array<{ title: string }>
}

/** Slug de una organización (reusa el generador de slugs de personas). */
export function orgSlug(name: string): string {
  return generateSlug(name)
}

/** Construye el modelo de la ficha para `slug` a partir de toda la gente del
 *  usuario + sus objetivos. Resuelve si el slug es un GRUPO o una EMPRESA. */
export function buildCompanyHub(
  slug: string,
  people: HubPerson[],
  goals: HubGoal[],
): CompanyHubModel {
  const target = slug.trim().toLowerCase()

  // 1. ¿Es un GRUPO? (algún orgGroupLabel slugificado coincide)
  const groupMatch = people.find((p) => {
    const label = orgGroupLabel(p)
    return label && orgSlug(label) === target
  })

  if (groupMatch) {
    const groupLabel = orgGroupLabel(groupMatch)
    const groupKey = orgJoinKey(groupMatch)
    const inGroup = people.filter((p) => orgJoinKey(p) === groupKey)
    // Sub-empresas: organizaciones distintas dentro del grupo donde hay gente.
    const byOrg = new Map<string, { label: string; count: number }>()
    for (const p of inGroup) {
      const org = (p.organization ?? '').trim()
      if (!org) continue
      const k = normalizeOrgKey(org)
      // No listamos el propio holding como "sub-empresa" de sí mismo.
      if (orgSlug(org) === target) continue
      const e = byOrg.get(k) ?? { label: org, count: 0 }
      e.count += 1
      byOrg.set(k, e)
    }
    const subCompanies: HubLink[] = [...byOrg.values()]
      .sort((a, b) => b.count - a.count)
      .map((e) => ({ label: e.label, slug: orgSlug(e.label), count: e.count }))
    return {
      found: inGroup.length > 0,
      level: 'grupo',
      label: groupLabel,
      subCompanies,
      people: sortByImportance(inGroup),
      goals: goalsFor(inGroup, goals),
    }
  }

  // 2. ¿Es una EMPRESA? (algún organization slugificado coincide)
  const orgMatch = people.find((p) => {
    const org = (p.organization ?? '').trim()
    return org && orgSlug(org) === target
  })
  if (orgMatch) {
    const orgLabel = (orgMatch.organization ?? '').trim()
    const orgKey = normalizeOrgKey(orgLabel)
    const inOrg = people.filter((p) => normalizeOrgKey((p.organization ?? '').trim()) === orgKey)
    const groupLabel = orgGroupLabel(orgMatch)
    const parentGroup: HubLink | undefined =
      groupLabel && orgSlug(groupLabel) !== target
        ? { label: groupLabel, slug: orgSlug(groupLabel) }
        : undefined
    return {
      found: inOrg.length > 0,
      level: 'empresa',
      label: orgLabel,
      parentGroup,
      subCompanies: [],
      people: sortByImportance(inOrg),
      goals: goalsFor(inOrg, goals),
    }
  }

  return { found: false, level: 'empresa', label: slug, subCompanies: [], people: [], goals: [] }
}

function sortByImportance(people: HubPerson[]): HubPerson[] {
  return [...people].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
}

function goalsFor(people: HubPerson[], goals: HubGoal[]): Array<{ title: string }> {
  const ids = new Set(people.map((p) => p.id))
  return goals
    .filter((g) => (g.personIds ?? []).some((pid) => ids.has(pid)))
    .map((g) => ({ title: g.title }))
}
