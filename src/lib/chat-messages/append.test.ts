import { describe, it, expect } from 'vitest'

import { canalDe, chatMessageId, limaWallClock, minuteKey, toChatRows, type ChatMessageInput } from './append'

describe('minuteKey', () => {
  it('trunca a minuto en UTC', () => {
    expect(minuteKey('2026-07-01T10:23:45.678Z')).toBe('2026-07-01T10:23')
  })
  it('colapsa segundos distintos al mismo minuto', () => {
    expect(minuteKey('2026-07-01T10:23:45Z')).toBe(minuteKey('2026-07-01T10:23:00Z'))
  })
  it('normaliza la zona horaria a UTC (misma hora de pared → mismo minuto)', () => {
    expect(minuteKey('2026-07-09T09:23:45-05:00')).toBe('2026-07-09T14:23')
  })
  it('null / vacío → cadena vacía', () => {
    expect(minuteKey(null)).toBe('')
    expect(minuteKey('')).toBe('')
  })
})

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

  it('MISMO minuto, segundos distintos → MISMO id (fix de los 148k dups)', () => {
    const conSegundos = chatMessageId('u1', 'p1', 'whatsapp', '2026-07-09T14:23:45Z', 'other', 'hola')
    const truncado = chatMessageId('u1', 'p1', 'whatsapp', '2026-07-09T14:23:00Z', 'other', 'hola')
    expect(conSegundos).toBe(truncado)
  })

  it('minuto distinto → id distinto (no colapsa de más)', () => {
    const a = chatMessageId('u1', 'p1', 'whatsapp', '2026-07-09T14:23:00Z', 'other', 'hola')
    const b = chatMessageId('u1', 'p1', 'whatsapp', '2026-07-09T14:24:00Z', 'other', 'hola')
    expect(a).not.toBe(b)
  })
})

describe('limaWallClock', () => {
  it('convierte el instante real a la hora de pared de Lima (-5)', () => {
    expect(limaWallClock('2026-07-16T23:44:31Z')).toBe('2026-07-16T18:44:31.000Z')
  })

  it('acepta epoch en milisegundos', () => {
    expect(limaWallClock(Date.UTC(2026, 6, 16, 23, 44, 31))).toBe('2026-07-16T18:44:31.000Z')
  })

  it('cruza el día para atrás cuando corresponde', () => {
    expect(limaWallClock('2026-07-17T02:00:00Z')).toBe('2026-07-16T21:00:00.000Z')
  })

  it('no fechable → null (nunca inventa una hora)', () => {
    expect(limaWallClock(null)).toBeNull()
    expect(limaWallClock('')).toBeNull()
    expect(limaWallClock('mañana')).toBeNull()
  })
})

describe('canalDe', () => {
  it("'reader' resuelve al canal cuando ese canal tiene doble ingesta", () => {
    expect(canalDe('reader', 'whatsapp')).toBe('whatsapp')
    expect(canalDe('channel', 'whatsapp')).toBe('whatsapp')
  })

  it('un canal SIN segundo camino de ingesta no se normaliza (no le movemos el id)', () => {
    expect(canalDe('reader', 'teams')).toBe('reader')
    expect(canalDe('reader', 'email')).toBe('reader')
  })

  it('sin plataforma se queda con el source (no inventa canal)', () => {
    expect(canalDe('reader', null)).toBe('reader')
    expect(canalDe('reader', '')).toBe('reader')
  })

  it('un source que YA es canal no se toca aunque venga plataforma', () => {
    expect(canalDe('whatsapp', 'teams')).toBe('whatsapp')
  })

  it('normaliza mayúsculas y espacios de la plataforma', () => {
    expect(canalDe('reader', ' WhatsApp ')).toBe('whatsapp')
  })
})

describe('identidad entre caminos de captura (el bug de los 71k)', () => {
  // El mismo mensaje: la extensión lo vio por el Store (instante UTC real, con
  // segundos) y el export lo trajo con la hora mostrada, truncada al minuto.
  const DEL_STORE = '2026-07-16T23:44:31Z'   // instante real
  const DEL_EXPORT = '2026-07-16T18:44:00Z'  // hora de pared, ya en convención

  it('colapsan al MISMO id una vez normalizado el tiempo y el canal', () => {
    const reader = chatMessageId('u1', 'p1', canalDe('reader', 'whatsapp'), limaWallClock(DEL_STORE), 'user', 'Amor no te olvides enviar las facturas')
    const importado = chatMessageId('u1', 'p1', canalDe('whatsapp'), DEL_EXPORT, 'user', 'Amor no te olvides enviar las facturas')
    expect(reader).toBe(importado)
  })

  it('sin normalizar NO colapsaban (esto es lo que duplicó ~71k)', () => {
    const reader = chatMessageId('u1', 'p1', 'reader', DEL_STORE, 'user', 'Amor no te olvides enviar las facturas')
    const importado = chatMessageId('u1', 'p1', 'whatsapp', DEL_EXPORT, 'user', 'Amor no te olvides enviar las facturas')
    expect(reader).not.toBe(importado)
  })

  it('toChatRows le pasa la plataforma al id (no el camino de captura)', () => {
    const [fila] = toChatRows('u1', 'p1', 'reader', [
      { iso: limaWallClock(DEL_STORE), sender: 'user', content: 'hola' },
    ], 'whatsapp')
    expect(fila.id).toBe(chatMessageId('u1', 'p1', 'whatsapp', DEL_EXPORT, 'user', 'hola'))
    // …pero la fila SIGUE guardando source='reader' como trazabilidad de origen.
    expect(fila.source).toBe('reader')
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
