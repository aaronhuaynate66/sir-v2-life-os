// SIR V2 — Test de integración "caso Diana": asegura que la conversación de
// WhatsApp importada a una persona REALMENTE llega al prompt de SIR (ask) y de la
// Sala de ensayo (rehearse), y documenta la resolución de nombre DOS DIANAS.
//
// Reproduce la FORMA EXACTA del `data` que escribe /api/capture/whatsapp-export
// (summary/topics/emotionalStates{user,otherPerson}/rawMessages{author,content,
// timestamp}/messageCount) y ejerce el camino real:
//   getPersonConversation → renderConversationForPrompt → buildAskContext
//   + buildRehearseUserContent (con selfState).
// No toca la DB real: mockea el cliente de Supabase con esa observación.

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getPersonConversation, renderConversationForPrompt } from './conversation'
import { buildAskContext, extractCandidateNames, type AskPersonCtx } from '@/lib/sir/ask'
import { buildRehearseUserContent, type RehearseContext } from '@/lib/influence/rehearsePrompt'

// —— Observación whatsapp_chat con la forma EXACTA del writer (0 datos reales). ——
const dianaObservation = {
  data: {
    personName: 'Diana',
    summary: 'Pareja en reconciliación frágil; discutieron por redes sociales y celos.',
    topics: ['celos', 'instagram', 'confianza', 'mudanza'],
    emotionalStates: { user: 'inseguro/celoso', otherPerson: 'a la defensiva' },
    rawMessages: [
      { timestamp: '11:00', author: 'user', content: 'no me aceptas en redes' },
      { timestamp: '11:05', author: 'other', content: 'ya te acepté, ya basta' },
      { timestamp: '11:20', author: 'user', content: 'perdón, estoy alterado' },
    ],
    messageCount: 70811,
    source: 'whatsapp_export',
  },
  observed_at: '2026-07-03T15:00:00Z',
}

// Mock chainable de Supabase. La observación se resuelve por `.maybeSingle()`
// (tabla observations) y el sustrato por `.range()` (tabla chat_messages, lo que
// lee fetchChatMessages). Por defecto el sustrato viene vacío → getPersonConversation
// cae al fallback de la muestra de la observación.
function mockSupabase(row: unknown, chatRows: unknown[] = []): SupabaseClient {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'order', 'limit']
  for (const m of methods) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }))
  chain.range = vi.fn(async () => ({ data: chatRows, error: null }))
  return { from: vi.fn(() => chain) } as unknown as SupabaseClient
}

describe('caso Diana — la conversación importada llega al prompt', () => {
  it('getPersonConversation parsea la observación con la forma del writer', async () => {
    const conv = await getPersonConversation(mockSupabase(dianaObservation), 'user-1', 'diana-id')
    expect(conv).not.toBeNull()
    expect(conv!.summary).toMatch(/reconciliación frágil/)
    expect(conv!.topics).toContain('celos')
    expect(conv!.userState).toBe('inseguro/celoso')
    expect(conv!.otherState).toBe('a la defensiva')
    expect(conv!.messageCount).toBe(70811)
    expect(conv!.recentMessages).toHaveLength(3)
  })

  it('devuelve null si no hay observación NI sustrato (persona sin chat, ej. la otra Diana)', async () => {
    const conv = await getPersonConversation(mockSupabase(null), 'user-1', 'diana-cencaro-id')
    expect(conv).toBeNull()
  })

  it('PREFIERE el sustrato (chat_messages) sobre la muestra derivada, e incluye la voz transcrita', async () => {
    const chatRows = [
      { sender: 'other', sent_at: '2026-07-08T12:00:00Z', content: '🎙️ hola hijo, ¿te acuerdas de la talonera que te compré?', is_media: true },
      { sender: 'user', sent_at: '2026-07-08T12:05:00Z', content: 'sí, la del talón, claro', is_media: false },
    ]
    const conv = await getPersonConversation(mockSupabase(dianaObservation, chatRows), 'user-1', 'diana-id')
    expect(conv).not.toBeNull()
    // Los mensajes vienen del sustrato REAL (con la voz 🎙️), no de la muestra vieja.
    expect(conv!.recentMessages).toHaveLength(2)
    expect(conv!.recentMessages.some((m) => /🎙️.*talonera/.test(m.content))).toBe(true)
    expect(conv!.recentMessages.some((m) => m.content === 'no me aceptas en redes')).toBe(false)
    // Pero el resumen/temas/tono destilados siguen viniendo de la observación.
    expect(conv!.summary).toMatch(/reconciliación frágil/)
    expect(conv!.userState).toBe('inseguro/celoso')
    // Y el render lleva la voz al prompt.
    expect(renderConversationForPrompt(conv!, 'Papá')).toMatch(/🎙️.*talonera/)
  })

  it('el prompt de SIR (ask) incluye el contenido del chat, no solo metadata', async () => {
    const conv = await getPersonConversation(mockSupabase(dianaObservation), 'user-1', 'diana-id')
    const block = renderConversationForPrompt(conv!, 'Diana')
    const person: AskPersonCtx = {
      name: 'Diana', relationship: 'romantic', recentMemories: ['Se pelearon por redes'], conversation: block,
    }
    const prompt = buildAskContext({
      question: '¿cómo va el tema con Diana?', todayISO: '2026-07-05', people: [person], memories: [], goals: [],
    })
    // El chat real está en el prompt (no solo el nombre/score).
    expect(prompt).toMatch(/70811 mensajes/)
    expect(prompt).toMatch(/celos, instagram/)
    expect(prompt).toMatch(/Aaron: no me aceptas en redes/)
    expect(prompt).toMatch(/Diana: ya te acepté/)
  })

  it('la Sala de ensayo cruza el chat + el estado bio (ventana de tolerancia)', async () => {
    const conv = await getPersonConversation(mockSupabase(dianaObservation), 'user-1', 'diana-id')
    const ctx: RehearseContext = {
      personName: 'Diana', relationship: 'romantic', ambito: 'personal', memories: ['Reconciliación en curso'],
      conversation: renderConversationForPrompt(conv!, 'Diana'),
      selfState: 'Estado bio de Aaron AHORA: ventana de tolerancia ANGOSTA (fuera de la ventana), estrés elevado. IMPORTANTE: regular primero.',
    }
    const content = buildRehearseUserContent(ctx, 'reparar la pelea y reconstruir confianza')
    expect(content).toMatch(/70811 mensajes/)
    expect(content).toMatch(/no me aceptas en redes/)
    expect(content).toMatch(/ventana de tolerancia ANGOSTA/)
    expect(content).toMatch(/reparar la pelea/)
  })
})

describe('caso Diana — resolución de nombre DOS DIANAS', () => {
  const known = ['Diana Carolina Díaz Sánchez', 'Diana Cencaro', 'Alex Mendoza']

  it('el nombre suelto "Diana" resuelve a AMBAS (riesgo conocido)', () => {
    const hits = extractCandidateNames('¿cómo va el tema con Diana?', known)
    expect(hits).toContain('Diana Carolina Díaz Sánchez')
    expect(hits).toContain('Diana Cencaro')
  })

  it('el nombre completo/apellido desambigua a la novia', () => {
    const hits = extractCandidateNames('¿cómo va con Diana Carolina Díaz Sánchez?', known)
    expect(hits[0]).toBe('Diana Carolina Díaz Sánchez')
    expect(hits).not.toContain('Diana Cencaro')
  })
})
