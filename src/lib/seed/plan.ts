// SIR V2 — Seed Batch Plan (puro)
//
// Lógica para procesar un batch JSON de personas + observaciones + orgs +
// person_links (formato ver data/seed-batches/README.md). PURO — no toca DB.
// El caller (endpoint /api/seed/batch, o el script CLI) provee 2 lookups:
//   - slugTaken(slug) → boolean (para ensureUniqueSlug)
//   - orgExists(slug) → boolean (para no duplicar org_profiles)
//
// Devuelve un `SeedPlan` con TODO lo que hay que escribir. Escribirlo o no
// es responsabilidad del caller (dry-run vs commit).

const SELF_SENTINEL = 'self' as const

// ─── Types del JSON de entrada ──────────────────────────────────────

export interface BatchPersonInput {
  person: {
    name: string
    alias?: string | null
    relationship?: string
    category?: string
    title?: string | null
    organization?: string | null
    linkedin_url?: string | null
    instagram_handle?: string | null
    phone_number?: string | null
    location?: string | null
    education?: string | null
    gender?: string | null
    importance_score?: number
    trust_level?: number
    energy_impact?: 'neutral' | 'energizing' | 'draining'
    contact_frequency?: string
    last_contact?: string | null
    notes?: string
  }
  tags?: string[]
  org_link?: {
    name: string
    role?: string
    area?: string
    relation?: string
    since?: string
    warning?: string
  }
  observations?: Array<{
    capture_type: string
    confidence?: 'high' | 'medium' | 'low'
    observed_at?: string
    source_url?: string
    data?: Record<string, unknown>
  }>
}

/** Un person_link explícito del JSON. `person_a`/`person_b` son NOMBRES de
 *  personas del batch (o el sentinel "SELF" para el usuario). */
export interface BatchPersonLinkInput {
  person_a: string
  person_b: string
  kind: string
  /** Opcional: 'alto' | 'medio' | 'bajo' o número 0-10. */
  _peso?: string | number
  /** Opcional: texto libre para el context de la arista. */
  _context?: string
}

export interface SeedBatchInput {
  _meta?: Record<string, unknown>
  people?: BatchPersonInput[]
  person_links?: BatchPersonLinkInput[]
}

// ─── Rows planificados (listos para insert) ─────────────────────────

export interface PlannedPersonRow {
  id: string
  user_id: string
  slug: string
  name: string
  alias: string | null
  relationship: string
  category: string
  importance_score: number
  trust_level: number
  energy_impact: string
  contact_frequency: string
  last_contact: string | null
  location: string | null
  tags: string[]
  notes: string
  linkedin_url: string | null
  instagram_handle: string | null
  phone_number: string | null
  title: string | null
  organization: string | null
  education: string | null
  gender: string | null
  created_at: string
  updated_at: string
}

export interface PlannedObservationRow {
  id: string
  user_id: string
  person_id: string
  capture_type: string
  data: Record<string, unknown>
  confidence: string
  observed_at: string
  is_obsolete: boolean
  created_at: string
}

export interface PlannedOrgProfileRow {
  id: string
  user_id: string
  org_slug: string
  name: string
  description: string | null
  website: string | null
  notes: string | null
  source: string
  sectors: string[]
  created_at: string
  updated_at: string
  /** true = ya existía → NO se inserta, se reusa. */
  existing: boolean
}

export interface PlannedPersonLinkRow {
  id: string
  user_id: string
  person_a_id: string // uuid, id de persona, o 'self'
  person_b_id: string
  kind: string
  weight: number | null
  context: string | null
  source: string
  confidence: string
  created_at: string
  /** true = derivado auto (misma org+área); false = venía en el JSON. */
  inferred: boolean
}

export interface SeedPlan {
  people: PlannedPersonRow[]
  observations: PlannedObservationRow[]
  orgs: PlannedOrgProfileRow[]
  links: PlannedPersonLinkRow[]
  /** Warnings a mostrar al usuario (nombres sin match, gaps, etc.). */
  warnings: string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function generateSlug(name: string): string {
  return String(name || 'persona')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'persona'
}

function newId(prefix: string, rand: () => number = Math.random): string {
  return `${prefix}_${Date.now()}_${rand().toString(36).slice(2, 8)}`
}

/** Normaliza un peso ("alto"/"medio"/"bajo" o número) a 0-10. null si vacío. */
export function parseWeight(raw: string | number | undefined): number | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') return Math.max(0, Math.min(10, Math.round(raw)))
  const s = String(raw).toLowerCase().trim()
  if (s === 'alto' || s === 'alta') return 8
  if (s === 'medio' || s === 'media') return 5
  if (s === 'bajo' || s === 'baja') return 3
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null
}

interface BuildPlanArgs {
  input: SeedBatchInput
  userId: string
  /** Devuelve true si ya existe una persona con ese slug en la DB del user. */
  slugTaken: (slug: string) => boolean
  /** Devuelve true si ya existe org_profiles con ese slug. */
  orgExists: (slug: string) => boolean
  /** Reloj inyectable para tests. Default Date.now. */
  now?: Date
  /** RNG inyectable para tests (para ids deterministas). */
  rand?: () => number
}

// ─── Función principal ──────────────────────────────────────────────

export function buildSeedPlan(args: BuildPlanArgs): SeedPlan {
  const { input, userId, slugTaken, orgExists } = args
  const now = args.now ?? new Date()
  const nowIso = now.toISOString()
  const rand = args.rand ?? Math.random

  const people: PlannedPersonRow[] = []
  const observations: PlannedObservationRow[] = []
  const orgs: PlannedOrgProfileRow[] = []
  const links: PlannedPersonLinkRow[] = []
  const warnings: string[] = []

  // Slug uniqueness: acumula slugs asignados en este plan + los de la DB.
  const usedSlugs = new Set<string>()
  function ensureUniqueSlug(base: string): string {
    let slug = base
    let n = 2
    while (usedSlugs.has(slug) || slugTaken(slug)) {
      slug = `${base}-${n++}`
      if (n > 20) return `${base}-${Date.now().toString(36).slice(-4)}`
    }
    usedSlugs.add(slug)
    return slug
  }

  // Mapa nombre → id, para resolver los person_links explícitos por nombre.
  const nameToId = new Map<string, string>()
  const orgsByS = new Map<string, PlannedOrgProfileRow>()

  // ─── 1. People + observations + org_profiles ────────────────────
  for (const p of input.people ?? []) {
    const baseSlug = generateSlug(p.person.alias || p.person.name)
    const slug = ensureUniqueSlug(baseSlug)
    const id = newId('per', rand)

    const row: PlannedPersonRow = {
      id,
      user_id: userId,
      slug,
      name: p.person.name,
      alias: p.person.alias ?? null,
      relationship: p.person.relationship ?? 'professional',
      category: p.person.category ?? 'network',
      importance_score: p.person.importance_score ?? 5,
      trust_level: p.person.trust_level ?? 5,
      energy_impact: p.person.energy_impact ?? 'neutral',
      contact_frequency: p.person.contact_frequency ?? '',
      last_contact: p.person.last_contact ?? null,
      location: p.person.location ?? null,
      tags: p.tags ?? [],
      notes: p.person.notes ?? '',
      linkedin_url: p.person.linkedin_url ?? null,
      instagram_handle: p.person.instagram_handle ?? null,
      phone_number: p.person.phone_number ?? null,
      title: p.person.title ?? null,
      organization: p.person.organization ?? null,
      education: p.person.education ?? null,
      gender: p.person.gender ?? null,
      created_at: nowIso,
      updated_at: nowIso,
    }
    people.push(row)
    nameToId.set(p.person.name, id)
    if (p.person.alias) nameToId.set(p.person.alias, id)

    for (const o of p.observations ?? []) {
      observations.push({
        id: newId('obs', rand),
        user_id: userId,
        person_id: id,
        capture_type: o.capture_type,
        data: o.data ?? {},
        confidence: o.confidence ?? 'medium',
        observed_at: o.observed_at ? new Date(o.observed_at).toISOString() : nowIso,
        is_obsolete: false,
        created_at: nowIso,
      })
    }

    if (p.org_link?.name) {
      const orgSlug = generateSlug(p.org_link.name)
      if (!orgsByS.has(orgSlug)) {
        const existing = orgExists(orgSlug)
        orgsByS.set(orgSlug, {
          id: newId('org', rand),
          user_id: userId,
          org_slug: orgSlug,
          name: p.org_link.name,
          description: null,
          website: null,
          notes: p.org_link.warning ?? null,
          source: 'linkedin_batch',
          sectors: [],
          created_at: nowIso,
          updated_at: nowIso,
          existing,
        })
        if (existing) warnings.push(`Org "${p.org_link.name}" (slug ${orgSlug}) ya existe — se reusa (no se duplica).`)
      }
    }
  }
  for (const org of orgsByS.values()) orgs.push(org)

  // ─── 2. Person links explícitos del JSON ────────────────────────
  for (const l of input.person_links ?? []) {
    const aIsSelf = l.person_a === 'SELF' || l.person_a === 'self'
    const bIsSelf = l.person_b === 'SELF' || l.person_b === 'self'
    const aId = aIsSelf ? SELF_SENTINEL : nameToId.get(l.person_a)
    const bId = bIsSelf ? SELF_SENTINEL : nameToId.get(l.person_b)
    if (!aId) {
      warnings.push(`person_link: "${l.person_a}" no está en el batch, se omite.`)
      continue
    }
    if (!bId) {
      warnings.push(`person_link: "${l.person_b}" no está en el batch, se omite.`)
      continue
    }
    if (bIsSelf) {
      // person_b_id no acepta 'self' (por mig 0058) — la FK sigue viva.
      // Invertimos: (SELF → persona) se guarda como (persona ← SELF). Pero para
      // no perder la dirección explícita del JSON, dejamos aId=persona, bId=persona
      // (invertido) NO — mejor: skip con warning.
      warnings.push(`person_link con person_b='self' no soportado por el schema — invertí a person_a='SELF'.`)
      continue
    }
    links.push({
      id: newId('lnk', rand),
      user_id: userId,
      person_a_id: aId,
      person_b_id: bId,
      kind: l.kind,
      weight: parseWeight(l._peso),
      context: l._context ?? null,
      source: 'linkedin_batch',
      confidence: 'medium',
      created_at: nowIso,
      inferred: false,
    })
  }

  // ─── 3. Person links AUTO por org+área ──────────────────────────
  // Solo entre personas del batch. Evita duplicar si ya hay un link explícito
  // entre las mismas 2 (por id + kind).
  const explicitPairs = new Set(
    links.map((l) => `${[l.person_a_id, l.person_b_id].sort().join('|')}|${l.kind}`),
  )
  for (let i = 0; i < (input.people?.length ?? 0); i++) {
    for (let j = i + 1; j < (input.people?.length ?? 0); j++) {
      const a = input.people![i]
      const b = input.people![j]
      if (!a.org_link?.name || a.org_link.name !== b.org_link?.name) continue
      const aId = nameToId.get(a.person.name)!
      const bId = nameToId.get(b.person.name)!
      const sameArea = a.org_link.area && a.org_link.area === b.org_link.area
      const kind = sameArea ? 'colega_area' : 'colega'
      const pairKey = `${[aId, bId].sort().join('|')}|${kind}`
      if (explicitPairs.has(pairKey)) continue
      links.push({
        id: newId('lnk', rand),
        user_id: userId,
        person_a_id: aId,
        person_b_id: bId,
        kind,
        weight: sameArea ? 7 : 5,
        context: sameArea
          ? `${a.org_link.name} · área ${a.org_link.area}`
          : a.org_link.name,
        source: 'linkedin_batch',
        confidence: 'medium',
        created_at: nowIso,
        inferred: true,
      })
    }
  }

  return { people, observations, orgs, links, warnings }
}
