import { describe, it, expect } from 'vitest'
import { filterMessagesSince, sliceParsedSince, incrementalSummary } from './incremental'
import type { ExportMessage, ParsedExport } from './types'

function msg(iso: string | null, content = 'hola', isMedia = false): ExportMessage {
  return { iso, time: '12:00', author: 'Ana', content, isMedia }
}

function parsed(messages: ExportMessage[]): ParsedExport {
  const withIso = messages.filter((m) => m.iso)
  return {
    messages,
    systemLineCount: 0,
    mediaCount: messages.filter((m) => m.isMedia).length,
    format: 'ios',
    participants: ['Ana', 'Aaron'],
    firstISO: withIso.length ? withIso[0].iso : null,
    lastISO: withIso.length ? withIso[withIso.length - 1].iso : null,
  }
}

describe('filterMessagesSince', () => {
  it('devuelve todos si no hay marca previa (primer import)', () => {
    const ms = [msg('2026-06-10T12:00:00.000Z'), msg('2026-06-12T12:00:00.000Z')]
    expect(filterMessagesSince(ms, null)).toHaveLength(2)
  })

  it('devuelve solo los posteriores a la marca', () => {
    const ms = [
      msg('2026-06-10T12:00:00.000Z'),
      msg('2026-06-12T12:00:00.000Z'),
      msg('2026-06-16T12:00:00.000Z'),
    ]
    const out = filterMessagesSince(ms, '2026-06-12T12:00:00.000Z')
    expect(out).toHaveLength(1)
    expect(out[0].iso).toBe('2026-06-16T12:00:00.000Z')
  })

  it('archivo idéntico re-subido → 0 nuevos', () => {
    const ms = [msg('2026-06-10T12:00:00.000Z'), msg('2026-06-12T12:00:00.000Z')]
    expect(filterMessagesSince(ms, '2026-06-12T12:00:00.000Z')).toHaveLength(0)
  })

  it('descarta mensajes sin fecha en modo incremental', () => {
    const ms = [msg(null), msg('2026-06-16T12:00:00.000Z'), msg(null)]
    const out = filterMessagesSince(ms, '2026-06-12T12:00:00.000Z')
    expect(out).toHaveLength(1)
  })
})

describe('sliceParsedSince', () => {
  it('recomputa firstISO sobre la ventana nueva y conserva lastISO real', () => {
    const p = parsed([
      msg('2026-06-10T12:00:00.000Z'),
      msg('2026-06-14T21:00:00.000Z', 'pelea', false),
      msg('2026-06-16T16:00:00.000Z', 'cierre'),
    ])
    const sliced = sliceParsedSince(p, '2026-06-12T00:00:00.000Z')
    expect(sliced.messages).toHaveLength(2)
    expect(sliced.firstISO).toBe('2026-06-14T21:00:00.000Z')
    expect(sliced.lastISO).toBe('2026-06-16T16:00:00.000Z')
    expect(sliced.participants).toEqual(['Ana', 'Aaron'])
  })

  it('sin marca previa clona el parsed completo', () => {
    const p = parsed([msg('2026-06-10T12:00:00.000Z')])
    const sliced = sliceParsedSince(p, null)
    expect(sliced.messages).toHaveLength(1)
  })

  it('recuenta media en la ventana nueva', () => {
    const p = parsed([
      msg('2026-06-10T12:00:00.000Z', 'x', true),
      msg('2026-06-16T12:00:00.000Z', 'y', true),
    ])
    const sliced = sliceParsedSince(p, '2026-06-12T00:00:00.000Z')
    expect(sliced.mediaCount).toBe(1)
  })
})

describe('incrementalSummary', () => {
  it('primer import: isFirstImport, no duplicate', () => {
    const p = parsed([msg('2026-06-10T12:00:00.000Z'), msg('2026-06-12T12:00:00.000Z')])
    const s = incrementalSummary(p, null)
    expect(s.isFirstImport).toBe(true)
    expect(s.isDuplicate).toBe(false)
    expect(s.newCount).toBe(2)
  })

  it('archivo ya conocido: isDuplicate', () => {
    const p = parsed([msg('2026-06-10T12:00:00.000Z'), msg('2026-06-12T12:00:00.000Z')])
    const s = incrementalSummary(p, '2026-06-12T12:00:00.000Z')
    expect(s.isDuplicate).toBe(true)
    expect(s.newCount).toBe(0)
  })

  it('archivo que creció: cuenta solo lo nuevo y marca firstNewISO', () => {
    const p = parsed([
      msg('2026-06-10T12:00:00.000Z'),
      msg('2026-06-12T12:00:00.000Z'),
      msg('2026-06-16T16:00:00.000Z'),
    ])
    const s = incrementalSummary(p, '2026-06-12T12:00:00.000Z')
    expect(s.newCount).toBe(1)
    expect(s.firstNewISO).toBe('2026-06-16T16:00:00.000Z')
    expect(s.lastISO).toBe('2026-06-16T16:00:00.000Z')
    expect(s.isDuplicate).toBe(false)
  })
})
