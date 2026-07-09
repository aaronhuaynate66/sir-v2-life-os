import { describe, it, expect } from 'vitest'

import { chatMessageId, toChatRows, type ChatMessageInput } from './append'

describe('chatMessageId', () => {
  it('es determinístico: mismos campos → mismo id', () => {
    const a = chatMessageId('u1', 'p1', 'whatsapp', '2026-07-01T10:00:00.000Z', 'other', 'hola')
    const b = chatMessageId('u1', 'p1', 'whatsapp', '2026-07-01T10:00:00.000Z', 'other', 'hola')
    expect(a).toBe(b)
    expect(a).toMatch(/^cm_[0-9a-f]{40}$/)
  })

  it('cambia si cambia texto, emisor, fecha, fuente o persona', () => {
    const base = chatMessageId('u1', 'p1', 'whatsapp', '2026-07-01T10:00:00.000Z', 'other', 'hola')
    expect(chatMessageId('u1', 'p1', 'whatsapp', '2026-07-01T10:00:00.000Z', 'other', 'chau')).not.toBe(base)
    expect(chatMessageId('u1', 'p1', 'whatsapp', '2026-07-01T10:00:00.000Z', 'user', 'hola')).not.toBe(base)
    expect(chatMessageId('u1', 'p1', 'whatsapp', '2026-07-01T11:00:00.000Z', 'other', 'hola')).not.toBe(base)
    expect(chatMessageId('u1', 'p1', 'reader', '2026-07-01T10:00:00.000Z', 'other', 'hola')).not.toBe(base)
    expect(chatMessageId('u1', 'p2', 'whatsapp', '2026-07-01T10:00:00.000Z', 'other', 'hola')).not.toBe(base)
  })

  it('null iso es estable (no rompe el hash)', () => {
    const a = chatMessageId('u1', 'p1', 'whatsapp', null, 'other', 'hola')
    const b = chatMessageId('u1', 'p1', 'whatsapp', null, 'other', 'hola')
    expect(a).toBe(b)
  })
})

describe('toChatRows', () => {
  const msgs: ChatMessageInput[] = [
    { iso: '2026-07-01T10:00:00.000Z', sender: 'other', authorName: 'Diana', content: 'hola' },
    { iso: '2026-07-01T10:01:00.000Z', sender: 'user', authorName: 'Aaron', content: 'qué tal' },
  ]

  it('mapea inputs a filas con id, sender, sent_at y author_name', () => {
    const rows = toChatRows('u1', 'p1', 'whatsapp', msgs)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      user_id: 'u1', person_id: 'p1', source: 'whatsapp',
      sender: 'other', author_name: 'Diana', sent_at: '2026-07-01T10:00:00.000Z',
      content: 'hola', is_media: false,
    })
    expect(rows[0].id).toBe(chatMessageId('u1', 'p1', 'whatsapp', '2026-07-01T10:00:00.000Z', 'other', 'hola'))
    expect(rows[1].sender).toBe('user')
  })

  it('descarta mensajes vacíos no-media pero conserva media', () => {
    const rows = toChatRows('u1', 'p1', 'whatsapp', [
      { iso: null, sender: 'other', content: '' },
      { iso: '2026-07-01T10:00:00.000Z', sender: 'other', content: '[media]', isMedia: true },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].is_media).toBe(true)
  })

  it('normaliza sender desconocido a "other" y iso corto/ inválido a null', () => {
    const rows = toChatRows('u1', 'p1', 'whatsapp', [
      // @ts-expect-error probamos un sender fuera del union a propósito
      { iso: 'x', sender: 'weird', content: 'algo' },
    ])
    expect(rows[0].sender).toBe('other')
    expect(rows[0].sent_at).toBeNull()
  })

  it('acota contenido a 8000 y author_name a 120', () => {
    const rows = toChatRows('u1', 'p1', 'whatsapp', [
      { iso: null, sender: 'other', authorName: 'a'.repeat(300), content: 'b'.repeat(9000) },
    ])
    expect(rows[0].content.length).toBe(8000)
    expect(rows[0].author_name?.length).toBe(120)
  })
})
