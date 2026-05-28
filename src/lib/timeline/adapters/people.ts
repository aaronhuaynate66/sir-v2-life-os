// SIR V2 — Person → TimelineEvent adapter
//
// people.created_at emite un evento "agregaste a X a tu red". El estado
// posterior de la persona (last_contact, updates, etc.) NO se materializa
// como evento por ahora — no hay audit log de cambios.

import type { Person, RelationshipType, PersonCategory } from '@/types'
import type { TimelineEvent } from '../types'

const RELATIONSHIP_LABEL: Record<RelationshipType, string> = {
  family: 'familia',
  friend: 'amigo/a',
  romantic: 'pareja',
  professional: 'profesional',
  mentor: 'mentor/a',
  mentee: 'aprendiz',
  acquaintance: 'conocido/a',
}

const CATEGORY_LABEL: Record<PersonCategory, string> = {
  inner_circle: 'círculo cercano',
  close: 'cercano',
  network: 'network',
  peripheral: 'periférico',
}

export function adaptPerson(p: Person): TimelineEvent {
  const displayName = p.alias?.trim() || p.name
  return {
    id: `relational_event:p:${p.id}`,
    type: 'relational_event',
    occurredAt: p.createdAt,
    title: `Agregaste a ${displayName} a tu red`,
    body: p.notes || undefined,
    tags: [RELATIONSHIP_LABEL[p.relationship], CATEGORY_LABEL[p.category]],
    meta: {
      sourceKind: 'person_added',
      personId: p.id,
      name: p.name,
      alias: p.alias,
      relationship: p.relationship,
      category: p.category,
    },
  }
}

export function adaptPeople(rows: Person[]): TimelineEvent[] {
  return rows.map(adaptPerson)
}
