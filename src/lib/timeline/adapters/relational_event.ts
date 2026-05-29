// SIR V2 — Relationship.history → TimelineEvent[] adapter
//
// Cada Relationship trae un array `history` de RelationshipEvent. Por
// Implementation Note #2 del ADR 0005, validamos que cada item tenga una
// fecha ISO 8601 valida; si no, lo skipeamos con un warning en consola y
// NO lo sumamos al feed.

import type { Person, Relationship, RelationshipEvent } from '@/types'
import type { TimelineEvent } from '../types'

const HISTORY_TYPE_LABEL: Record<RelationshipEvent['type'], string> = {
  positive: 'positivo',
  negative: 'negativo',
  neutral: 'neutral',
  milestone: 'hito',
  whatsapp_capture: 'captura',
}

function isValidIso8601(s: unknown): s is string {
  if (typeof s !== 'string' || s.length === 0) return false
  const d = new Date(s)
  return !isNaN(d.getTime()) && d.toISOString() !== 'Invalid Date'
}

export function adaptRelationalHistory(
  relationships: Relationship[],
  people: Person[],
): TimelineEvent[] {
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const events: TimelineEvent[] = []

  for (const r of relationships) {
    const person = peopleById.get(r.personId)
    const personName = (person?.alias?.trim() || person?.name) ?? '—'

    for (const h of r.history) {
      if (!isValidIso8601(h.date)) {
        if (typeof console !== 'undefined') {
          console.warn(
            `[timeline] relational_event skipping invalid date "${String(h.date)}" in relationship ${r.id}/${h.id}`,
          )
        }
        continue
      }

      const toneLabel =
        h.emotionalTone > 0 ? `+${h.emotionalTone}` : `${h.emotionalTone}`

      // Items de captura WhatsApp llevan body distinto + tags extra desde
      // topics. captureKind + confidence propagados habilitan groupByCapture
      // y el body line dinamico del TimelineCardGrouped.
      const isWhatsApp = h.captureKind === 'whatsapp'
      const tags: string[] = [HISTORY_TYPE_LABEL[h.type] ?? h.type]
      if (isWhatsApp && Array.isArray(h.topics)) {
        tags.push(...h.topics.slice(0, 4))
      }

      events.push({
        id: `relational_event:h:${r.id}:${h.id}`,
        type: 'relational_event',
        occurredAt: new Date(h.date).toISOString(),
        title: `${personName}: ${h.description}`,
        body: isWhatsApp ? h.description : `Tono emocional: ${toneLabel}`,
        tags,
        meta: {
          sourceKind: 'relationship_history',
          relationshipId: r.id,
          personId: r.personId,
          historyId: h.id,
          emotionalTone: h.emotionalTone,
          historyType: h.type,
          confidence: h.confidence,
        },
        captureId: h.captureId,
        captureKind: h.captureKind,
      })
    }
  }

  return events
}
