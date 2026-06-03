import { describe, it, expect } from 'vitest'

import { chunkConversation } from './chunk'
import type { ExportMessage } from './types'

function msg(i: number, content: string): ExportMessage {
  return {
    iso: `2024-05-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
    time: '10:00',
    author: i % 2 === 0 ? 'Ana' : 'Yo',
    content,
    isMedia: false,
  }
}

describe('chunkConversation', () => {
  it('lista vacía → sin bloques', () => {
    expect(chunkConversation([])).toEqual([])
  })

  it('corta en límite de mensaje y NO pierde mensajes', () => {
    const msgs = Array.from({ length: 100 }, (_, i) => msg(i, `mensaje número ${i} bla bla bla`))
    const chunks = chunkConversation(msgs, { targetChars: 200, maxChunks: 50 })
    expect(chunks.length).toBeGreaterThan(1)
    const total = chunks.reduce((acc, c) => acc + c.messageCount, 0)
    expect(total).toBe(100)
    // Cada bloque tiene texto y al menos un mensaje.
    for (const c of chunks) {
      expect(c.messageCount).toBeGreaterThan(0)
      expect(c.text.length).toBeGreaterThan(0)
    }
  })

  it('respeta el techo maxChunks agrandando el bloque', () => {
    const msgs = Array.from({ length: 1000 }, (_, i) => msg(i, `texto de relleno ${i} para forzar muchos bloques`))
    const chunks = chunkConversation(msgs, { targetChars: 100, maxChunks: 10 })
    expect(chunks.length).toBeLessThanOrEqual(10)
    const total = chunks.reduce((acc, c) => acc + c.messageCount, 0)
    expect(total).toBe(1000)
  })

  it('un bloque arrastra el rango de fechas', () => {
    const msgs = [msg(0, 'a'), msg(1, 'b'), msg(2, 'c')]
    const chunks = chunkConversation(msgs, { targetChars: 100000 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].firstISO).toBeTruthy()
    expect(chunks[0].lastISO).toBeTruthy()
    expect(chunks[0].index).toBe(0)
  })
})
