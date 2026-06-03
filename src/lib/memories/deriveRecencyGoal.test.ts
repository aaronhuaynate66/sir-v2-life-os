// SIR V2 — Tests de las MEJORAS de derivación (caso Dayana):
//   - peso por recencia (degradado de lo viejo) en el mapeo de items del LLM
//   - extracción estructurada (categorías → tags) + próxima acción
//   - asignación de índices que NO resucita descartes (reservedIndices)
//   - cap por observación (conversación admite más que un perfil)
//   - digest con señales de conversación partidas por recencia
//   - inyección del contexto de objetivo + secciones de recencia en el prompt
//   - parse de los campos nuevos del LLM

import { describe, it, expect } from 'vitest'

import type { Observation, CaptureType } from '@/lib/capture/observations/types'
import {
  assignDerivedIndices,
  isConversationCapture,
  digestObservations,
  memoriesFromLlmItems,
  MAX_MEMORIES_PER_CONVERSATION,
  type DerivedMemoryItem,
} from './deriveFromObservations'
import { buildDeriveInput, parseDeriveResponse } from './derivePrompt'

const NOW = new Date('2026-06-03T12:00:00Z')

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
    observedAt: over.observedAt ?? '2026-05-30T12:00:00Z',
    capturedAt: over.capturedAt ?? '2026-05-31T08:00:00Z',
    isObsolete: false,
    obsoletedAt: null,
    obsoletedReason: null,
    createdAt: '2026-05-31T08:00:00Z',
    ...over,
  }
}

describe('assignDerivedIndices', () => {
  it('asigna los índices libres más bajos', () => {
    expect(assignDerivedIndices(new Set(), 3)).toEqual([0, 1, 2])
  })
  it('salta los índices reservados (descartes)', () => {
    expect(assignDerivedIndices(new Set([0, 2]), 3)).toEqual([1, 3, 4])
  })
})

describe('isConversationCapture', () => {
  it('whatsapp_chat/web sí; linkedin/instagram no', () => {
    expect(isConversationCapture('whatsapp_chat')).toBe(true)
    expect(isConversationCapture('whatsapp_web')).toBe(true)
    expect(isConversationCapture('linkedin')).toBe(false)
    expect(isConversationCapture('instagram')).toBe(false)
  })
})

describe('digestObservations con señales de conversación', () => {
  it('adjunta la lectura por recencia para conversaciones con material rico', () => {
    const o = obs({
      id: 'conv',
      captureType: 'whatsapp_chat',
      data: {
        summary: 'resumen',
        blockSummaries: ['viejo: fue delegada', 'nuevo: hablaron de la web de la botica'],
        facts: ['trabaja en Boticas Jhodaal'],
        dateRange: { first: '2023-01-01', last: '2026-05-30' },
        messageCount: 2023,
      },
    })
    const [d] = digestObservations([o], NOW)
    expect(d.conversation).toBeDefined()
    expect(d.conversation!.messageCount).toBe(2023)
    expect(d.conversation!.recentBlocks.at(-1)).toContain('web de la botica')
  })

  it('no adjunta señales a perfiles ni a conversaciones sin material rico', () => {
    const li = obs({ id: 'li', captureType: 'linkedin', data: { headline: 'CEO' } })
    const thin = obs({ id: 'thin', captureType: 'whatsapp_chat', data: { summary: 'hola' } })
    const [d1, d2] = digestObservations([li, thin], NOW)
    expect(d1.conversation).toBeUndefined()
    expect(d2.conversation).toBeUndefined()
  })
})

describe('memoriesFromLlmItems — recencia + categorías', () => {
  const observations = [obs({ id: 'conv', captureType: 'whatsapp_chat' })]

  it('degrada importancia de lo histórico y lo obsoleto', () => {
    const items: DerivedMemoryItem[] = [
      { observationIndex: 0, content: 'Fue delegada de clase hace años', importance: 9, isStale: true },
      { observationIndex: 0, content: 'Dato de contexto viejo', importance: 9, recency: 'historical' },
      { observationIndex: 0, content: 'Interés actual en la web', importance: 9, recency: 'recent' },
    ]
    const ms = memoriesFromLlmItems('Dayana', observations, items, {
      maxPerObservation: MAX_MEMORIES_PER_CONVERSATION,
    })
    expect(ms[0].importance).toBeLessThanOrEqual(2) // stale
    expect(ms[0].tags).toContain('obsoleto')
    expect(ms[1].importance).toBeLessThanOrEqual(4) // historical
    expect(ms[1].tags).toContain('histórico')
    expect(ms[2].importance).toBe(9) // reciente: intacto
  })

  it('mapea categoría a tag canónico (próxima acción)', () => {
    const items: DerivedMemoryItem[] = [
      { observationIndex: 0, content: 'Enviar propuesta de setup', category: 'proxima_accion', importance: 8 },
      { observationIndex: 0, content: 'Le interesa la web', category: 'comercial' },
      { observationIndex: 0, content: 'Tiene dudas del precio', category: 'objecion' },
    ]
    const ms = memoriesFromLlmItems('Dayana', observations, items, { maxPerObservation: 8 })
    expect(ms[0].tags).toContain('próximo_paso')
    expect(ms[1].tags).toContain('comercial')
    expect(ms[2].tags).toContain('objeción')
  })

  it('respeta reservedIndices (no resucita un descarte)', () => {
    const items: DerivedMemoryItem[] = [
      { observationIndex: 0, content: 'm1' },
      { observationIndex: 0, content: 'm2' },
    ]
    const reserved = new Map([['conv', new Set([0])]])
    const ms = memoriesFromLlmItems('X', observations, items, {
      maxPerObservation: 8,
      reservedIndices: reserved,
    })
    expect(ms.map((m) => m.id)).toEqual(['mem_obs:conv:1', 'mem_obs:conv:2'])
  })

  it('cap por función: conversación 8, perfil 2', () => {
    const mixed = [obs({ id: 'conv', captureType: 'whatsapp_chat' }), obs({ id: 'li', captureType: 'linkedin' })]
    const items: DerivedMemoryItem[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ observationIndex: 0, content: `c${i}` })),
      ...Array.from({ length: 5 }, (_, i) => ({ observationIndex: 1, content: `l${i}` })),
    ]
    const ms = memoriesFromLlmItems('X', mixed, items, {
      maxPerObservation: (o) => (isConversationCapture(o.captureType) ? 8 : 2),
    })
    expect(ms.filter((m) => m.id.startsWith('mem_obs:conv')).length).toBe(8)
    expect(ms.filter((m) => m.id.startsWith('mem_obs:li')).length).toBe(2)
  })
})

describe('buildDeriveInput', () => {
  it('inyecta el contexto del objetivo y secciones de recencia', () => {
    const o = obs({
      id: 'conv',
      captureType: 'whatsapp_chat',
      observedAt: '2026-05-30T12:00:00Z',
      data: {
        blockSummaries: [
          'b0: fue delegada de clase',
          'b1: ayuda con medicamentos',
          'b2: charla familiar',
          'b3: coordinaron una visita',
          'b4: hablaron de la web de la botica',
          'b5: interés en cotizar',
        ],
        facts: ['trabaja en Boticas Jhodaal'],
        dateRange: { first: '2023-01-01', last: '2026-05-30' },
        messageCount: 2023,
      },
    })
    const digests = digestObservations([o], NOW)
    const input = buildDeriveInput('Dayana', digests, '1. "Cerrar Boticas Jhodaal" [career]\n   meta: web a comisión')
    expect(input).toContain('OBJETIVOS DEL USUARIO')
    expect(input).toContain('Cerrar Boticas Jhodaal')
    expect(input).toContain('ESTADO RECIENTE')
    expect(input).toContain('contexto histórico')
    expect(input).toContain('2023 mensajes')
  })

  it('sin objetivos no rompe ni agrega la sección', () => {
    const digests = digestObservations([obs({ id: 'c', data: { summary: 'hola' } })], NOW)
    const input = buildDeriveInput('Ana', digests, null)
    expect(input).not.toContain('OBJETIVOS DEL USUARIO')
    expect(input).toContain('Persona: Ana')
  })
})

describe('parseDeriveResponse — campos nuevos', () => {
  it('extrae category, recency, isStale', () => {
    const raw =
      '{"memories":[{"observationIndex":0,"content":"x","category":"comercial","recency":"recent","isStale":false},{"observationIndex":0,"content":"y","recency":"historical","isStale":true}]}'
    const items = parseDeriveResponse(raw)
    expect(items[0].category).toBe('comercial')
    expect(items[0].recency).toBe('recent')
    expect(items[1].isStale).toBe(true)
    expect(items[1].recency).toBe('historical')
  })

  it('recency inválido → undefined; isStale ausente → false', () => {
    const items = parseDeriveResponse('{"memories":[{"observationIndex":0,"content":"x","recency":"ayer"}]}')
    expect(items[0].recency).toBeUndefined()
    expect(items[0].isStale).toBe(false)
  })
})
