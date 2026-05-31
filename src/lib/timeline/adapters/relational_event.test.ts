// SIR V2 — Tests del adapter relacional (JSONB + tabla).
//
// Lo crítico de la Opción B: ambas fuentes (adaptRelationalHistory desde el
// JSONB y adaptRelationalEventRows desde relationship_events) deben producir
// el MISMO `id` para el mismo evento lógico, para que el reader pueda
// deduplicar entre fuentes. Además: skip de fechas inválidas, render
// WhatsApp vs no-WhatsApp, lookup de nombre, y coerción de la fila de tabla.

import { describe, it, expect } from 'vitest'

import type { Person, Relationship, RelationshipEvent } from '@/types'
import { adaptRelationalHistory, adaptRelationalEventRows } from './relational_event'

const person = (id: string, name: string, alias?: string): Person =>
  ({ id, name, alias }) as unknown as Person

const histEvent = (over: Partial<RelationshipEvent> & { id: string }): RelationshipEvent =>
  ({
    type: 'neutral',
    date: '2026-05-30T12:00:00.000Z',
    description: 'algo pasó',
    emotionalTone: 0,
    ...over,
  }) as RelationshipEvent

const rel = (id: string, personId: string, history: RelationshipEvent[]): Relationship =>
  ({ id, personId, history }) as unknown as Relationship

describe('dedup entre fuentes: mismo id desde JSONB y desde tabla', () => {
  it('produce el mismo TimelineEvent.id para el mismo evento lógico', () => {
    const people = [person('p1', 'Diana')]
    const jsonb = adaptRelationalHistory(
      [rel('rel_p1', 'p1', [histEvent({ id: 'cap1' })])],
      people,
    )
    const table = adaptRelationalEventRows(
      [
        {
          id: 'cap1',
          relationship_id: 'rel_p1',
          person_id: 'p1',
          event_date: '2026-05-30T12:00:00.000Z',
          description: 'algo pasó',
          event_type: 'neutral',
          emotional_tone: 0,
        },
      ],
      people,
    )
    expect(jsonb).toHaveLength(1)
    expect(table).toHaveLength(1)
    expect(jsonb[0].id).toBe('relational_event:h:rel_p1:cap1')
    expect(table[0].id).toBe(jsonb[0].id) // ← clave de dedup
  })
})

describe('adaptRelationalHistory', () => {
  const people = [person('p1', 'Diana Pérez', 'Diana'), person('p2', 'Bob')]

  it('usa alias si existe, si no el name, si no "—"', () => {
    const withAlias = adaptRelationalHistory([rel('r1', 'p1', [histEvent({ id: 'e1' })])], people)
    expect(withAlias[0].title).toBe('Diana: algo pasó')
    const noAlias = adaptRelationalHistory([rel('r2', 'p2', [histEvent({ id: 'e2' })])], people)
    expect(noAlias[0].title).toBe('Bob: algo pasó')
    const unknown = adaptRelationalHistory([rel('r3', 'pX', [histEvent({ id: 'e3' })])], people)
    expect(unknown[0].title).toBe('—: algo pasó')
  })

  it('skipea eventos con fecha inválida', () => {
    const out = adaptRelationalHistory(
      [
        rel('r1', 'p1', [
          histEvent({ id: 'ok', date: '2026-05-30T00:00:00.000Z' }),
          histEvent({ id: 'bad', date: 'no-es-fecha' }),
        ]),
      ],
      people,
    )
    expect(out.map((e) => e.meta.historyId)).toEqual(['ok'])
  })

  it('evento WhatsApp: body undefined, tags con topics (máx 4)', () => {
    const out = adaptRelationalHistory(
      [
        rel('r1', 'p1', [
          histEvent({
            id: 'e1',
            type: 'whatsapp_capture',
            captureKind: 'whatsapp',
            captureId: 'e1',
            topics: ['a', 'b', 'c', 'd', 'e'],
          }),
        ]),
      ],
      people,
    )
    expect(out[0].body).toBeUndefined()
    expect(out[0].captureKind).toBe('whatsapp')
    expect(out[0].captureId).toBe('e1')
    // primer tag = label del tipo ('captura'), luego 4 topics
    expect(out[0].tags).toEqual(['captura', 'a', 'b', 'c', 'd'])
  })

  it('evento no-WhatsApp: body con tono con signo', () => {
    const pos = adaptRelationalHistory([rel('r1', 'p1', [histEvent({ id: 'e1', type: 'positive', emotionalTone: 3 })])], people)
    expect(pos[0].body).toBe('Tono emocional: +3')
    const neg = adaptRelationalHistory([rel('r2', 'p1', [histEvent({ id: 'e2', type: 'negative', emotionalTone: -2 })])], people)
    expect(neg[0].body).toBe('Tono emocional: -2')
  })
})

describe('adaptRelationalEventRows', () => {
  const people = [person('p1', 'Diana')]

  it('coerciona emotional_tone (number, string, null) y event_type fallback', () => {
    const rows = [
      { id: 'a', relationship_id: 'r1', person_id: 'p1', event_date: '2026-05-30T00:00:00.000Z', emotional_tone: 4, event_type: 'positive', description: 'x' },
      { id: 'b', relationship_id: 'r1', person_id: 'p1', event_date: '2026-05-30T00:00:00.000Z', emotional_tone: '2', event_type: null, description: 'y' },
      { id: 'c', relationship_id: 'r1', person_id: 'p1', event_date: '2026-05-30T00:00:00.000Z', emotional_tone: null, event_type: 'neutral', description: 'z' },
    ]
    const out = adaptRelationalEventRows(rows, people)
    expect(out.find((e) => e.meta.historyId === 'a')!.meta.emotionalTone).toBe(4)
    expect(out.find((e) => e.meta.historyId === 'b')!.meta.emotionalTone).toBe(2)
    expect(out.find((e) => e.meta.historyId === 'b')!.meta.historyType).toBe('neutral') // fallback
    expect(out.find((e) => e.meta.historyId === 'c')!.meta.emotionalTone).toBe(0)
  })

  it('relationship_id null -> fallback rel_${person_id}', () => {
    const out = adaptRelationalEventRows(
      [{ id: 'a', relationship_id: null, person_id: 'p1', event_date: '2026-05-30T00:00:00.000Z', description: 'x', event_type: 'neutral' }],
      people,
    )
    expect(out[0].id).toBe('relational_event:h:rel_p1:a')
  })

  it('skipea filas con event_date inválido', () => {
    const out = adaptRelationalEventRows(
      [
        { id: 'ok', relationship_id: 'r1', person_id: 'p1', event_date: '2026-05-30T00:00:00.000Z', description: 'x', event_type: 'neutral' },
        { id: 'bad', relationship_id: 'r1', person_id: 'p1', event_date: 'nope', description: 'y', event_type: 'neutral' },
      ],
      people,
    )
    expect(out.map((e) => e.meta.historyId)).toEqual(['ok'])
  })

  it('captureKind no reconocido -> undefined (narrowing)', () => {
    const out = adaptRelationalEventRows(
      [{ id: 'a', relationship_id: 'r1', person_id: 'p1', event_date: '2026-05-30T00:00:00.000Z', description: 'x', event_type: 'neutral', capture_kind: 'telegram' }],
      people,
    )
    expect(out[0].captureKind).toBeUndefined()
  })
})
