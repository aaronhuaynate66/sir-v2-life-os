// SIR V2 — Test del ancla temporal en el prompt de whatsapp_chat.
// Sin el "Hoy es …" el modelo no podía resolver los separadores relativos
// ("Hoy"/"Ayer"/día) y conversationDate quedaba null aunque el chat mostrara
// la fecha. Estos tests fijan que el ancla se inyecta bien.

import { describe, it, expect } from 'vitest'

import { getSystemPrompt } from './prompt'

describe('getSystemPrompt — ancla temporal', () => {
  it('inyecta el CONTEXTO TEMPORAL con la fecha cuando se pasa todayISO', () => {
    const p = getSystemPrompt(false, '2026-07-10')
    expect(p).toContain('CONTEXTO TEMPORAL')
    expect(p).toContain('2026-07-10')
    expect(p).toContain('"Hoy"')
    expect(p).toContain('"Ayer"')
  })

  it('NO inyecta el ancla si no se pasa todayISO', () => {
    const p = getSystemPrompt(false)
    expect(p).not.toContain('CONTEXTO TEMPORAL')
  })

  it('ignora un todayISO con formato inválido (no rompe, no inyecta)', () => {
    const p = getSystemPrompt(false, 'ayer' as unknown as string)
    expect(p).not.toContain('CONTEXTO TEMPORAL')
  })

  it('conserva el prompt base (reglas de conversationDate)', () => {
    const p = getSystemPrompt(false, '2026-07-10')
    expect(p).toContain('conversationDate')
  })
})
