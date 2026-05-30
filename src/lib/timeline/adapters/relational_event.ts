// SIR V2 — Relational history → TimelineEvent[] adapter
//
// DOS FUENTES, UN SOLO FORMATO (Opción B, no-lossy):
//   (a) tabla append-only `relationship_events` (PRIMARIA, indexada/capeada)
//   (b) JSONB `relationships.history` (FALLBACK / respaldo intacto)
// Ambas producen TimelineEvent con el MISMO `id`
// (`relational_event:h:${relationshipId}:${eventId}`), de modo que el reader
// puede deduplicar entre fuentes sin ambigüedad. Por eso el mapeo concreto
// vive en un único builder `buildRelationalEvent` y cada fuente solo
// normaliza sus campos a `RelationalEventInput`.
//
// Por Implementation Note #2 del ADR 0005, validamos que cada item tenga una
// fecha ISO 8601 válida; si no, lo skipeamos con un warning y NO lo sumamos.

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

/** Forma normalizada que comparten ambas fuentes (JSONB y tabla). */
interface RelationalEventInput {
  relationshipId: string
  eventId: string
  personId: string
  date: unknown
  description: string
  type: string
  emotionalTone: number
  captureKind?: string | null
  captureId?: string | null
  topics?: unknown
  confidence?: string | null
}

/**
 * Builder único: normalized input -> TimelineEvent. Devuelve null si la
 * fecha no es ISO 8601 válida (mismo skip+warn que antes). El `id` es
 * estable entre fuentes -> sirve de clave de dedup en el reader.
 */
function buildRelationalEvent(
  input: RelationalEventInput,
  peopleById: Map<string, Person>,
  source: 'table' | 'jsonb',
): TimelineEvent | null {
  if (!isValidIso8601(input.date)) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[timeline] relational_event (${source}) skipping invalid date "${String(input.date)}" in ${input.relationshipId}/${input.eventId}`,
      )
    }
    return null
  }

  const person = peopleById.get(input.personId)
  const personName = (person?.alias?.trim() || person?.name) ?? '—'

  const toneLabel =
    input.emotionalTone > 0 ? `+${input.emotionalTone}` : `${input.emotionalTone}`

  // Items de captura WhatsApp: el title ya contiene "Persona: <summary>",
  // por eso NO duplicamos la summary en body. Tags extra desde topics.
  const isWhatsApp = input.captureKind === 'whatsapp'
  const typeLabel = HISTORY_TYPE_LABEL[input.type as RelationshipEvent['type']] ?? input.type
  const tags: string[] = [typeLabel]
  if (isWhatsApp && Array.isArray(input.topics)) {
    tags.push(...(input.topics as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 4))
  }

  return {
    id: `relational_event:h:${input.relationshipId}:${input.eventId}`,
    type: 'relational_event',
    occurredAt: new Date(input.date as string).toISOString(),
    title: `${personName}: ${input.description}`,
    body: isWhatsApp ? undefined : `Tono emocional: ${toneLabel}`,
    tags,
    meta: {
      sourceKind: 'relationship_history',
      relationshipId: input.relationshipId,
      personId: input.personId,
      historyId: input.eventId,
      emotionalTone: input.emotionalTone,
      historyType: input.type,
      confidence: input.confidence ?? undefined,
    },
    captureId: input.captureId ?? undefined,
    captureKind:
      input.captureKind === 'whatsapp' || input.captureKind === 'scale'
        ? input.captureKind
        : undefined,
  }
}

/**
 * Fuente JSONB (fallback / respaldo). Unpack de `relationships.history`.
 */
export function adaptRelationalHistory(
  relationships: Relationship[],
  people: Person[],
): TimelineEvent[] {
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const events: TimelineEvent[] = []

  for (const r of relationships) {
    for (const h of r.history) {
      const ev = buildRelationalEvent(
        {
          relationshipId: r.id,
          eventId: h.id,
          personId: r.personId,
          date: h.date,
          description: h.description,
          type: h.type,
          emotionalTone: h.emotionalTone,
          captureKind: h.captureKind,
          captureId: h.captureId,
          topics: h.topics,
          confidence: h.confidence,
        },
        peopleById,
        'jsonb',
      )
      if (ev) events.push(ev)
    }
  }

  return events
}

/**
 * Fuente tabla (PRIMARIA). Filas snake_case de `relationship_events`.
 * `event_date` ya viene como timestamptz ISO desde PostgREST.
 */
export function adaptRelationalEventRows(
  rows: Record<string, unknown>[],
  people: Person[],
): TimelineEvent[] {
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const events: TimelineEvent[] = []

  for (const row of rows) {
    const relationshipId =
      (row.relationship_id as string | null) ??
      // fallback defensivo: si relationship_id viniera null, derivar del person.
      `rel_${String(row.person_id ?? '')}`
    const tone = row.emotional_tone
    const ev = buildRelationalEvent(
      {
        relationshipId,
        eventId: String(row.id),
        personId: String(row.person_id ?? ''),
        date: row.event_date,
        description: (row.description as string | null) ?? '',
        type: (row.event_type as string | null) ?? 'neutral',
        emotionalTone: typeof tone === 'number' ? tone : Number(tone ?? 0) || 0,
        captureKind: (row.capture_kind as string | null) ?? null,
        captureId: (row.capture_id as string | null) ?? null,
        topics: row.topics,
        confidence: (row.confidence as string | null) ?? null,
      },
      peopleById,
      'table',
    )
    if (ev) events.push(ev)
  }

  return events
}
