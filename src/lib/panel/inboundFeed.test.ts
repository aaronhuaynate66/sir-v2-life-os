import { describe, it, expect } from 'vitest'

import {
  buildInboundFeed,
  channelFor,
  type InboundDirectionSample,
  type InboundObservationInput,
  type InboundPersonMeta,
} from './inboundFeed'

const NOW = new Date('2026-07-10T12:00:00Z')

function iso(daysAgo: number, hoursAgo = 0): string {
  return new Date(NOW.getTime() - daysAgo * 86_400_000 - hoursAgo * 3_600_000).toISOString()
}

function people(...entries: Array<[string, InboundPersonMeta]>): Map<string, InboundPersonMeta> {
  return new Map(entries)
}

describe('channelFor', () => {
  it('la plataforma del Reader manda sobre el capture_type', () => {
    expect(channelFor('dm_conversation', 'teams')).toEqual({ key: 'teams', label: 'Teams' })
    expect(channelFor('dm_conversation', 'email')).toEqual({ key: 'email', label: 'Correo' })
    expect(channelFor('dm_conversation', 'WhatsApp')).toEqual({ key: 'whatsapp', label: 'WhatsApp' })
  })

  it('cae al capture_type cuando no hay plataforma', () => {
    expect(channelFor('whatsapp_chat', null).key).toBe('whatsapp')
    expect(channelFor('whatsapp_web').key).toBe('whatsapp')
    expect(channelFor('instagram').key).toBe('instagram')
    expect(channelFor('dm_conversation', null)).toEqual({ key: 'dm', label: 'Mensaje directo' })
  })
})

describe('buildInboundFeed', () => {
  const meta = people(
    ['p1', { name: 'Ana', slug: 'ana' }],
    ['p2', { name: 'Beto', slug: 'beto' }],
  )

  it('agrupa por persona, ordena por recencia y cuenta las entradas', () => {
    const obs: InboundObservationInput[] = [
      { personId: 'p1', captureType: 'whatsapp_chat', summary: 'Charla vieja', observedAt: iso(3) },
      { personId: 'p1', captureType: 'whatsapp_chat', summary: 'Lo más nuevo de Ana', observedAt: iso(0, 2) },
      { personId: 'p2', captureType: 'dm_conversation', platform: 'teams', summary: 'Beto por Teams', observedAt: iso(1) },
    ]
    const feed = buildInboundFeed(obs, meta, [], { now: NOW })

    expect(feed.map((f) => f.personId)).toEqual(['p1', 'p2']) // p1 más reciente primero
    const ana = feed[0]
    expect(ana.entryCount).toBe(2)
    expect(ana.gist).toBe('Lo más nuevo de Ana') // cabeza = el más reciente
    expect(ana.channelLabel).toBe('WhatsApp')
    expect(feed[1].channelLabel).toBe('Teams')
  })

  it('marca esperando respuesta sólo si el último mensaje del sustrato es del OTRO', () => {
    const obs: InboundObservationInput[] = [
      { personId: 'p1', captureType: 'whatsapp_chat', summary: 'x', observedAt: iso(0, 1) },
      { personId: 'p2', captureType: 'whatsapp_chat', summary: 'y', observedAt: iso(0, 1) },
    ]
    const dir: InboundDirectionSample[] = [
      { personId: 'p1', sender: 'user', sentAt: iso(0, 2) },
      { personId: 'p1', sender: 'other', sentAt: iso(0, 5) }, // más viejo → no gana
      { personId: 'p2', sender: 'user', sentAt: iso(0, 5) },
      { personId: 'p2', sender: 'other', sentAt: iso(0, 1) }, // último → sí gana
    ]
    const feed = buildInboundFeed(obs, meta, dir, { now: NOW })
    const byId = new Map(feed.map((f) => [f.personId, f]))
    expect(byId.get('p1')!.awaitingReply).toBe(false) // el último tuyo
    expect(byId.get('p2')!.awaitingReply).toBe(true) // el último del otro
  })

  it('sin dirección conocida NO afirma esperando respuesta (honesto)', () => {
    const obs: InboundObservationInput[] = [
      { personId: 'p1', captureType: 'whatsapp_chat', summary: 'x', observedAt: iso(0, 1) },
    ]
    const feed = buildInboundFeed(obs, meta, [], { now: NOW })
    expect(feed[0].awaitingReply).toBe(false)
  })

  it('filtra fuera de ventana, no-conversaciones, personas desconocidas y obsoletas ya excluidas', () => {
    const obs: InboundObservationInput[] = [
      { personId: 'p1', captureType: 'whatsapp_chat', summary: 'viejo', observedAt: iso(30) }, // fuera de ventana
      { personId: 'p2', captureType: 'linkedin', summary: 'perfil', observedAt: iso(1) }, // no es conversación
      { personId: 'pX', captureType: 'whatsapp_chat', summary: 'fantasma', observedAt: iso(1) }, // no está en people
    ]
    const feed = buildInboundFeed(obs, meta, [], { now: NOW })
    expect(feed).toHaveLength(0)
  })

  it('respeta la ventana custom y el límite', () => {
    const obs: InboundObservationInput[] = [
      { personId: 'p1', captureType: 'whatsapp_chat', summary: 'a', observedAt: iso(5) },
      { personId: 'p2', captureType: 'whatsapp_chat', summary: 'b', observedAt: iso(2) },
    ]
    expect(buildInboundFeed(obs, meta, [], { now: NOW, windowDays: 3 })).toHaveLength(1) // p1 queda afuera
    expect(buildInboundFeed(obs, meta, [], { now: NOW, limit: 1 })).toHaveLength(1)
  })

  it('acota el gist largo y devuelve null cuando está vacío', () => {
    const long = 'x'.repeat(300)
    const obs: InboundObservationInput[] = [
      { personId: 'p1', captureType: 'whatsapp_chat', summary: long, observedAt: iso(0, 1) },
      { personId: 'p2', captureType: 'whatsapp_chat', summary: '   ', observedAt: iso(0, 1) },
    ]
    const feed = buildInboundFeed(obs, meta, [], { now: NOW })
    const byId = new Map(feed.map((f) => [f.personId, f]))
    expect(byId.get('p1')!.gist!.length).toBeLessThanOrEqual(160)
    expect(byId.get('p1')!.gist!.endsWith('…')).toBe(true)
    expect(byId.get('p2')!.gist).toBeNull()
  })
})
