// SIR V2 — Relationship store adapters (Sesión 20c)
// One store, two tables: people + relationships (FK people.id <- relationships.person_id).

import type {
  Person, Relationship, RelationshipType, PersonCategory, EnergyImpact,
  RelationshipStatus, RelationshipEvent, SpecialDate,
} from '@/types'
import type { TableAdapter } from '../types'

/** Normaliza el jsonb `people.special_dates` a SpecialDate[] tolerando
 *  filas viejas (null / shape parcial). Filtra entradas sin label/date. */
function parseSpecialDates(raw: unknown): SpecialDate[] {
  if (!Array.isArray(raw)) return []
  const out: SpecialDate[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const label = typeof r.label === 'string' ? r.label : ''
    const date = typeof r.date === 'string' ? r.date : ''
    if (!label || !date) continue
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : `${date}-${label}`,
      label,
      date,
      recurring: r.recurring === true,
    })
  }
  return out
}

export const personAdapter: TableAdapter<Person> = {
  table: 'people',
  toRow: (p, userId) => ({
    id: p.id,
    user_id: userId,
    slug: p.slug ?? null,
    name: p.name,
    alias: p.alias ?? null,
    relationship: p.relationship,
    category: p.category,
    importance_score: p.importanceScore,
    energy_impact: p.energyImpact,
    trust_level: p.trustLevel,
    last_contact: p.lastContact ?? null,
    contact_frequency: p.contactFrequency ?? '',
    location: p.location ?? null,
    tags: p.tags ?? [],
    notes: p.notes ?? '',
    birth_date: p.birthDate ?? null,
    cycle_start_date: p.cycleStartDate ?? null,
    cycle_length_days: p.cycleLengthDays ?? null,
    special_dates: p.specialDates ?? [],
    phone_number: p.phoneNumber ?? null,
    instagram_handle: p.instagramHandle ?? null,
    linkedin_url: p.linkedinUrl ?? null,
    twitter_handle: p.twitterHandle ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    slug: (row.slug as string) ?? undefined,
    name: row.name as string,
    alias: (row.alias as string) ?? undefined,
    relationship: row.relationship as RelationshipType,
    category: row.category as PersonCategory,
    importanceScore: Number(row.importance_score),
    energyImpact: row.energy_impact as EnergyImpact,
    trustLevel: Number(row.trust_level),
    lastContact: (row.last_contact as string) ?? undefined,
    contactFrequency: (row.contact_frequency as string) ?? '',
    location: (row.location as string) ?? undefined,
    tags: (row.tags as string[]) ?? [],
    notes: (row.notes as string) ?? '',
    birthDate: (row.birth_date as string) ?? undefined,
    cycleStartDate: (row.cycle_start_date as string) ?? undefined,
    cycleLengthDays:
      row.cycle_length_days !== null && row.cycle_length_days !== undefined
        ? Number(row.cycle_length_days)
        : undefined,
    specialDates: parseSpecialDates(row.special_dates),
    phoneNumber: (row.phone_number as string) ?? undefined,
    instagramHandle: (row.instagram_handle as string) ?? undefined,
    linkedinUrl: (row.linkedin_url as string) ?? undefined,
    twitterHandle: (row.twitter_handle as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }),
}

export const relationshipAdapter: TableAdapter<Relationship> = {
  table: 'relationships',
  toRow: (r, userId) => ({
    id: r.id,
    user_id: userId,
    person_id: r.personId,
    type: r.type,
    status: r.status,
    depth: r.depth,
    reciprocity: r.reciprocity,
    history: r.history ?? [],
    shared_goals: r.sharedGoals ?? [],
    tensions: r.tensions ?? [],
    strengths: r.strengths ?? [],
    next_action: r.nextAction ?? null,
    next_action_date: r.nextActionDate ?? null,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    personId: row.person_id as string,
    type: row.type as RelationshipType,
    status: row.status as RelationshipStatus,
    depth: Number(row.depth) || 5,
    reciprocity: Number(row.reciprocity) || 5,
    history: (row.history as RelationshipEvent[]) ?? [],
    sharedGoals: (row.shared_goals as string[]) ?? [],
    tensions: (row.tensions as string[]) ?? [],
    strengths: (row.strengths as string[]) ?? [],
    nextAction: (row.next_action as string) ?? undefined,
    nextActionDate: (row.next_action_date as string) ?? undefined,
  }),
}
