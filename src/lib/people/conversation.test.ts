// SIR V2 — Tests del render de conversación para prompts.

import { describe, it, expect } from 'vitest'
import { renderConversationForPrompt, type PersonConversation } from './conversation'

const conv: PersonConversation = {
  summary: 'Pareja en reconciliación frágil; hoy discutieron por redes sociales.',
  topics: ['celos', 'instagram', 'plata', 'mudanza'],
  recentMessages: [
    { author: 'user', content: 'no me aceptas en redes', timestamp: '11:00' },
    { author: 'other', content: 'ya te acepté, ya basta', timestamp: '11:05' },
  ],
  userState: 'inseguro/celoso',
  otherState: 'a la defensiva',
  messageCount: 70811,
}

describe('renderConversationForPrompt', () => {
  it('incluye resumen, temas, tono y una muestra de mensajes', () => {
    const txt = renderConversationForPrompt(conv, 'Diana')
    expect(txt).toMatch(/70811 mensajes/)
    expect(txt).toMatch(/Resumen:/)
    expect(txt).toMatch(/celos, instagram/)
    expect(txt).toMatch(/Aaron=inseguro\/celoso, Diana=a la defensiva/)
    expect(txt).toMatch(/Aaron: no me aceptas en redes/)
    expect(txt).toMatch(/Diana: ya te acepté/)
  })

  it('funciona con conversación mínima (sin tono ni mensajes)', () => {
    const txt = renderConversationForPrompt({ summary: 'x', topics: [], recentMessages: [] }, 'Alex')
    expect(txt).toMatch(/Alex/)
    expect(txt).not.toMatch(/Tono:/)
  })
})
