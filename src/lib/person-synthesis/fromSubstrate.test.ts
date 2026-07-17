import { describe, it, expect } from 'vitest'

import { buildTranscriptSample, buildSubstrateUserMessage } from './fromSubstrate'
import type { ChatMsgRow } from '@/lib/chat-messages/read'

const row = (sender: string, content: string, is_media = false): ChatMsgRow => ({ sender, content, sent_at: '2026-07-01T10:00:00.000Z', is_media })

describe('buildTranscriptSample', () => {
  it('mapea sender a etiqueta (Aaron / nombre) y arma líneas', () => {
    const t = buildTranscriptSample([row('other', 'hola'), row('user', 'qué tal')], 'Diana')
    expect(t).toBe('Diana: hola\nAaron: qué tal')
  })

  it('filtra media y vacíos', () => {
    const t = buildTranscriptSample([row('other', '[media]', true), row('user', '   '), row('other', 'real')], 'Diana')
    expect(t).toBe('Diana: real')
  })

  it('respeta el presupuesto de caracteres quedándose con la cola reciente', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row(i % 2 === 0 ? 'other' : 'user', `mensaje número ${i}`))
    const t = buildTranscriptSample(rows, 'Diana', 60)
    expect(t.length).toBeLessThanOrEqual(60)
    // La cola reciente → el último mensaje (49) debe estar; el primero (0) no.
    expect(t).toContain('49')
    expect(t).not.toContain('mensaje número 0\n')
  })
})

describe('buildSubstrateUserMessage', () => {
  it('incluye persona, rango, transcript y la instrucción', () => {
    const m = buildSubstrateUserMessage('Diana', 'Diana: hola', 120, '2026-01-01', '2026-07-01')
    expect(m).toContain('Persona: Diana')
    expect(m).toContain('120 mensajes')
    expect(m).toContain('del 2026-01-01 al 2026-07-01')
    expect(m).toContain('Diana: hola')
    expect(m).toContain('Escribe los 3 párrafos')
  })

  it('incluye el contexto de objetivos cuando se pasa', () => {
    const m = buildSubstrateUserMessage('Diana', 'x', 10, null, null, 'Objetivo: mudarse')
    expect(m).toContain('OBJETIVOS DEL USUARIO')
    expect(m).toContain('Objetivo: mudarse')
  })
})
