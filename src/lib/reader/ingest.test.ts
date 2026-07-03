// SIR V2 — Tests del núcleo de ingesta de SIR Reader.

import { describe, it, expect } from 'vitest'
import {
  readerHash, normalizeMessages, dedupeNew, sinceTimestamp, buildConversationText, planIngest,
  type ReaderBatch,
} from './ingest'

function batch(over: Partial<ReaderBatch> = {}): ReaderBatch {
  return {
    platform: 'teams', threadId: 'thr1', threadName: 'Cristina',
    messages: [
      { author: 'Cristina', text: 'hola', ts: '2026-07-02T10:00:00Z' },
      { author: 'Aaron', text: 'qué tal', ts: '2026-07-02T10:01:00Z' },
    ],
    ...over,
  }
}

describe('readerHash', () => {
  it('es determinístico y sensible al contenido', () => {
    const m = { author: 'A', text: 'x', ts: '2026-07-02T10:00:00Z' }
    expect(readerHash('t', m)).toBe(readerHash('t', m))
    expect(readerHash('t', m)).not.toBe(readerHash('t', { ...m, text: 'y' }))
    expect(readerHash('t', m)).not.toBe(readerHash('t2', m))
  })
})

describe('normalizeMessages', () => {
  it('limpia, hashea y descarta mensajes vacíos', () => {
    const n = normalizeMessages(batch({ messages: [
      { author: '  Cristina ', text: '  hola\n\nmundo ', ts: null },
      { author: 'x', text: '   ', ts: null }, // vacío → fuera
    ] }))
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ author: 'Cristina', text: 'hola mundo' })
    expect(n[0].hash).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('dedupeNew', () => {
  it('filtra los ya vistos y colapsa duplicados del batch', () => {
    const n = normalizeMessages(batch())
    const seen = new Set([n[0].hash])
    const fresh = dedupeNew([...n, n[1]], seen) // n[1] repetido
    expect(fresh).toHaveLength(1)
    expect(fresh[0].hash).toBe(n[1].hash)
  })
})

describe('sinceTimestamp', () => {
  it('deja solo lo posterior a lastTs; conserva los sin ts', () => {
    const n = normalizeMessages(batch({ messages: [
      { author: 'a', text: 'viejo', ts: '2026-07-02T09:00:00Z' },
      { author: 'b', text: 'nuevo', ts: '2026-07-02T11:00:00Z' },
      { author: 'c', text: 'sin fecha', ts: null },
    ] }))
    const out = sinceTimestamp(n, '2026-07-02T10:00:00Z')
    expect(out.map((m) => m.text)).toEqual(['nuevo', 'sin fecha'])
  })
  it('sin lastTs devuelve todo', () => {
    const n = normalizeMessages(batch())
    expect(sinceTimestamp(n, null)).toHaveLength(2)
  })
})

describe('buildConversationText', () => {
  it('arma líneas legibles con header', () => {
    const n = normalizeMessages(batch())
    const txt = buildConversationText('Cristina', n)
    expect(txt).toContain('Conversación con Cristina:')
    expect(txt).toContain('[2026-07-02T10:00:00Z] Cristina: hola')
    expect(txt).toContain('Aaron: qué tal')
  })
})

describe('planIngest — end-to-end puro', () => {
  it('normaliza + incremental + dedup + texto + latestTs', () => {
    const plan = planIngest(batch(), new Set(), null)
    expect(plan.fresh).toHaveLength(2)
    expect(plan.newHashes).toHaveLength(2)
    expect(plan.latestTs).toBe('2026-07-02T10:01:00Z')
    expect(plan.conversationText).toContain('Cristina: hola')
  })

  it('idempotente: re-enviar el mismo batch no trae nada nuevo', () => {
    const first = planIngest(batch(), new Set(), null)
    const seen = new Set(first.newHashes)
    const second = planIngest(batch(), seen, first.latestTs)
    expect(second.fresh).toHaveLength(0)
    expect(second.conversationText).toBe('')
  })

  it('acumula solo lo nuevo tras dejar el chat abierto', () => {
    const first = planIngest(batch(), new Set(), null)
    const seen = new Set(first.newHashes)
    const more = batch({ messages: [
      ...batch().messages,
      { author: 'Cristina', text: 'seguimos?', ts: '2026-07-02T12:00:00Z' },
    ] })
    const second = planIngest(more, seen, first.latestTs)
    expect(second.fresh.map((m) => m.text)).toEqual(['seguimos?'])
  })
})
