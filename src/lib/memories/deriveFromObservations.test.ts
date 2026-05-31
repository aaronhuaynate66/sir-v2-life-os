// SIR V2 — Tests de la derivación de memorias desde observations.
//
// Toda la lógica pura: clave estable / idempotencia, selección de
// no-cubiertas, mapeo determinístico observation→memoria base, mapeo de
// items del LLM (con clamping y descarte de inválidos), parse tolerante de
// la respuesta del modelo, y row builder con observation_id.

import { describe, it, expect } from 'vitest'

import type { Observation, CaptureType } from '@/lib/capture/observations/types'
import {
  deriveKey,
  parseDerivedKey,
  derivedMemoryId,
  observationIdFromMemoryId,
  selectUncoveredObservations,
  extractObservationText,
  extractTopics,
  baseMemoryFromObservation,
  baseMemoriesFromObservations,
  memoriesFromLlmItems,
  derivedMemoryToRow,
  type DerivedMemoryItem,
} from './deriveFromObservations'
import { parseDeriveResponse } from './derivePrompt'

function obs(over: Partial<Observation> & { id: string; captureType?: CaptureType }): Observation {
  return {
    userId: 'u',
    personId: over.personId ?? 'p1',
    captureType: over.captureType ?? 'whatsapp_chat',
    sourceImagePath: null,
    storageBucket: null,
    data: over.data ?? {},
    detectorData: null,
    userEdits: null,
    confidence: 'high',
    needsReview: false,
    observedAt: over.observedAt ?? '2026-05-20T12:00:00Z',
    capturedAt: over.capturedAt ?? '2026-05-21T08:00:00Z',
    isObsolete: false,
    obsoletedAt: null,
    obsoletedReason: null,
    createdAt: '2026-05-21T08:00:00Z',
    ...over,
  }
}

describe('clave estable / idempotencia', () => {
  it('deriveKey ↔ parseDerivedKey round-trip', () => {
    const k = deriveKey('obs-123', 1)
    expect(k).toBe('obs:obs-123:1')
    expect(parseDerivedKey(k)).toEqual({ observationId: 'obs-123', index: 1 })
  })

  it('parseDerivedKey ignora claves de otro namespace (backfill viejo)', () => {
    expect(parseDerivedKey('evt_abc123')).toBeNull()
    expect(parseDerivedKey('evt_abc_em')).toBeNull()
    expect(parseDerivedKey(null)).toBeNull()
    expect(parseDerivedKey(undefined)).toBeNull()
  })

  it('soporta observationId con guiones/colons internos (regex greedy)', () => {
    // un uuid con guiones
    const id = '7de2-626d-ec85'
    expect(parseDerivedKey(deriveKey(id, 0))).toEqual({ observationId: id, index: 0 })
  })

  it('derivedMemoryId construye el PK determinístico (mem_obs:<id>:<n>)', () => {
    expect(derivedMemoryId('o1', 0)).toBe('mem_obs:o1:0')
    expect(derivedMemoryId('o1', 2)).toBe('mem_obs:o1:2')
  })

  it('observationIdFromMemoryId es el inverso del PK derivado', () => {
    expect(observationIdFromMemoryId('mem_obs:o1:0')).toBe('o1')
    expect(observationIdFromMemoryId('mem_obs:7de2-626d:1')).toBe('7de2-626d')
    // ids ajenos (no derivados) → null
    expect(observationIdFromMemoryId('mem_evt_abc')).toBeNull()
    expect(observationIdFromMemoryId('otro')).toBeNull()
    expect(observationIdFromMemoryId(null)).toBeNull()
  })

  it('selectUncoveredObservations filtra las ya derivadas', () => {
    const all = [obs({ id: 'a' }), obs({ id: 'b' }), obs({ id: 'c' })]
    const covered = new Set(['a', 'c'])
    expect(selectUncoveredObservations(all, covered).map((o) => o.id)).toEqual(['b'])
  })

  it('selectUncovered con todo cubierto → []', () => {
    const all = [obs({ id: 'a' })]
    expect(selectUncoveredObservations(all, new Set(['a']))).toEqual([])
  })
})

describe('lectura defensiva de data', () => {
  it('extractObservationText prioriza summary > about > bio > ...', () => {
    expect(extractObservationText(obs({ id: '1', data: { summary: 'hola', bio: 'x' } }))).toBe('hola')
    expect(extractObservationText(obs({ id: '2', data: { bio: 'soy ing.' } }))).toBe('soy ing.')
    expect(extractObservationText(obs({ id: '3', data: {} }))).toBeNull()
    expect(extractObservationText(obs({ id: '4', data: { summary: '   ' } }))).toBeNull()
  })

  it('extractTopics lee topics o tags', () => {
    expect(extractTopics(obs({ id: '1', data: { topics: ['a', 'b', ''] } }))).toEqual(['a', 'b'])
    expect(extractTopics(obs({ id: '2', data: { tags: ['x'] } }))).toEqual(['x'])
    expect(extractTopics(obs({ id: '3', data: {} }))).toEqual([])
  })
})

describe('memoria base determinística', () => {
  it('whatsapp con summary → episodic, content = summary, tags = topics', () => {
    const m = baseMemoryFromObservation('Diana', obs({
      id: 'o1',
      captureType: 'whatsapp_chat',
      data: { summary: 'Hablaron de su viaje.', topics: ['viaje', 'familia'] },
    }))
    expect(m.type).toBe('episodic')
    expect(m.content).toBe('Hablaron de su viaje.')
    expect(m.tags).toEqual(['viaje', 'familia'])
    expect(m.source).toBe('inferred')
    expect(m.sourceEventId).toBe('obs:o1:0')
    expect(m.personId).toBe('p1')
    expect(m.entities).toEqual(['p1'])
  })

  it('instagram → social; linkedin → semantic', () => {
    expect(baseMemoryFromObservation('Ana', obs({ id: 'i', captureType: 'instagram', data: { bio: 'viajera' } })).type).toBe('social')
    expect(baseMemoryFromObservation('Ana', obs({ id: 'l', captureType: 'linkedin', data: { headline: 'CEO' } })).type).toBe('semantic')
  })

  it('sin texto ni topics → content genérico con label y nombre', () => {
    const m = baseMemoryFromObservation('Leo', obs({ id: 'o', captureType: 'manual_note', data: {} }))
    expect(m.content).toContain('Leo')
    expect(m.content).toContain('nota')
  })

  it('usa observedAt como timestamp', () => {
    const m = baseMemoryFromObservation('X', obs({ id: 'o', observedAt: '2026-04-01T00:00:00Z' }))
    expect(m.timestamp).toBe('2026-04-01T00:00:00Z')
  })

  it('baseMemoriesFromObservations: 1 por observation', () => {
    const ms = baseMemoriesFromObservations('X', [obs({ id: 'a' }), obs({ id: 'b' })])
    expect(ms.map((m) => m.sourceEventId)).toEqual(['obs:a:0', 'obs:b:0'])
  })
})

describe('mapeo de items del LLM', () => {
  const observations = [
    obs({ id: 'o0', captureType: 'whatsapp_chat' }),
    obs({ id: 'o1', captureType: 'instagram' }),
  ]

  it('mapea items válidos con claves estables incrementales por observation', () => {
    const items: DerivedMemoryItem[] = [
      { observationIndex: 0, type: 'episodic', title: 'A', content: 'momento 1', importance: 4, emotionalCharge: 3, tags: ['t'] },
      { observationIndex: 0, type: 'emotional', content: 'momento 2' },
    ]
    const ms = memoriesFromLlmItems('Diana', observations, items)
    expect(ms).toHaveLength(2)
    expect(ms.map((m) => m.sourceEventId)).toEqual(['obs:o0:0', 'obs:o0:1'])
    expect(ms[0].importance).toBe(4)
    expect(ms[0].emotionalCharge).toBe(3)
  })

  it('descarta índice fuera de rango y content vacío', () => {
    const items: DerivedMemoryItem[] = [
      { observationIndex: 9, content: 'fuera' },
      { observationIndex: 0, content: '   ' },
      { observationIndex: 1, content: 'ok' },
    ]
    const ms = memoriesFromLlmItems('X', observations, items)
    expect(ms).toHaveLength(1)
    expect(ms[0].sourceEventId).toBe('obs:o1:0')
  })

  it('clampea importance (1..10) y emotionalCharge (-10..10)', () => {
    const items: DerivedMemoryItem[] = [
      { observationIndex: 0, content: 'x', importance: 99, emotionalCharge: -50 },
    ]
    const [m] = memoriesFromLlmItems('X', observations, items)
    expect(m.importance).toBe(10)
    expect(m.emotionalCharge).toBe(-10)
  })

  it('tipo no permitido → cae al tipo base de la captura', () => {
    const items: DerivedMemoryItem[] = [{ observationIndex: 1, type: 'predictive', content: 'x' }]
    const [m] = memoriesFromLlmItems('X', observations, items)
    expect(m.type).toBe('social') // instagram → social
  })

  it('respeta el máximo de 2 memorias por observation', () => {
    const items: DerivedMemoryItem[] = [
      { observationIndex: 0, content: '1' },
      { observationIndex: 0, content: '2' },
      { observationIndex: 0, content: '3' },
    ]
    const ms = memoriesFromLlmItems('X', observations, items)
    expect(ms).toHaveLength(2)
  })
})

describe('parseDeriveResponse', () => {
  it('JSON limpio', () => {
    const raw = '{"memories":[{"observationIndex":0,"content":"hola","type":"episodic"}]}'
    const items = parseDeriveResponse(raw)
    expect(items).toHaveLength(1)
    expect(items[0].content).toBe('hola')
  })

  it('tolera prosa y fences alrededor del JSON', () => {
    const raw = 'Claro:\n```json\n{"memories":[{"observationIndex":2,"content":"x"}]}\n```\nListo.'
    const items = parseDeriveResponse(raw)
    expect(items).toHaveLength(1)
    expect(items[0].observationIndex).toBe(2)
  })

  it('JSON inválido → []', () => {
    expect(parseDeriveResponse('no json aquí')).toEqual([])
    expect(parseDeriveResponse('{roto')).toEqual([])
    expect(parseDeriveResponse('')).toEqual([])
  })

  it('memories vacío o ausente → []', () => {
    expect(parseDeriveResponse('{"memories":[]}')).toEqual([])
    expect(parseDeriveResponse('{"otra":1}')).toEqual([])
  })

  it('descarta items sin observationIndex numérico', () => {
    const raw = '{"memories":[{"content":"sin idx"},{"observationIndex":0,"content":"ok"}]}'
    expect(parseDeriveResponse(raw)).toHaveLength(1)
  })
})

describe('derivedMemoryToRow', () => {
  it('ancla en el PK id + observation_id; NO escribe source_event_id', () => {
    const m = baseMemoryFromObservation('X', obs({ id: 'o42' }))
    const row = derivedMemoryToRow(m, 'user-1')
    expect(row.id).toBe('mem_obs:o42:0')
    expect(row.user_id).toBe('user-1')
    expect(row.observation_id).toBe('o42')
    expect(row.source).toBe('inferred')
    expect(row.occurred_at).toBe(m.timestamp)
    // source_event_id NO debe estar en el row (columna ausente en prod).
    expect('source_event_id' in row).toBe(false)
  })
})
