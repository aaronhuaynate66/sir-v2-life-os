import { describe, it, expect } from 'vitest'

import { chatRowsToConvMsg, type ChatMsgRow } from './read'
import { pickRicherMessages } from '@/lib/conversation-analytics/fromObservations'
import type { ConvMsg } from '@/lib/conversation-analytics/analyze'

describe('chatRowsToConvMsg', () => {
  it('mapea sender→fromMe, sent_at→at (epoch ms), content→text', () => {
    const rows: ChatMsgRow[] = [
      { sender: 'other', sent_at: '2026-07-01T10:00:00.000Z', content: 'hola' },
      { sender: 'user', sent_at: '2026-07-01T10:01:00.000Z', content: 'qué tal' },
    ]
    const msgs = chatRowsToConvMsg(rows)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toEqual({ fromMe: false, at: Date.parse('2026-07-01T10:00:00.000Z'), text: 'hola' })
    expect(msgs[1].fromMe).toBe(true)
  })

  it('descarta mensajes sin fecha resoluble o sin texto', () => {
    const rows: ChatMsgRow[] = [
      { sender: 'other', sent_at: null, content: 'sin fecha' },
      { sender: 'other', sent_at: 'no-es-fecha', content: 'fecha inválida' },
      { sender: 'user', sent_at: '2026-07-01T10:00:00.000Z', content: '   ' },
      { sender: 'user', sent_at: '2026-07-01T10:00:00.000Z', content: 'válido' },
    ]
    const msgs = chatRowsToConvMsg(rows)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].text).toBe('válido')
  })
})

describe('pickRicherMessages', () => {
  const mk = (n: number, base = 1_000_000): ConvMsg[] =>
    Array.from({ length: n }, (_, i) => ({ fromMe: i % 2 === 0, at: base + i * 1000, text: `m${i}` }))

  it('elige el sustrato cuando tiene igual o más mensajes', () => {
    const sub = mk(5)
    const obs = mk(3, 9_000_000)
    const out = pickRicherMessages(sub, obs)
    expect(out).toHaveLength(5)
    expect(out[0].at).toBe(1_000_000) // vino del sustrato
  })

  it('cae a la observación cuando el sustrato está vacío o es más pobre (cero regresión)', () => {
    expect(pickRicherMessages([], mk(4))).toHaveLength(4)
    expect(pickRicherMessages(mk(2), mk(800, 9_000_000))[0].at).toBe(9_000_000)
  })

  it('dedupe por (fecha|texto) y orden cronológico', () => {
    const a: ConvMsg[] = [
      { fromMe: false, at: 2000, text: 'b' },
      { fromMe: false, at: 1000, text: 'a' },
      { fromMe: false, at: 1000, text: 'a' }, // dup exacto
    ]
    const out = pickRicherMessages(a, [])
    expect(out.map((m) => m.text)).toEqual(['a', 'b'])
  })
})
