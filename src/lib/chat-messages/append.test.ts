import { describe, it, expect } from 'vitest'

import { canalDe, chatMessageId, mensajesSinFecha, contenidoParaId, limaWallClock, minuteKey, toChatRows, type ChatMessageInput } from './append'

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

describe('contenidoParaId — la identidad ignora lo que el export no puede llevar', () => {
  it('recorta los bordes del mensaje entero', () => {
    expect(contenidoParaId('Recién leí tu mensaje\n')).toBe('Recién leí tu mensaje')
    expect(contenidoParaId('  hola  ')).toBe('hola')
  })

  it('recorta los bordes de CADA línea interna', () => {
    // El caso real: una línea que es solo un espacio, dentro de un menú del día.
    expect(contenidoParaId('Menu Criollo\n \nEntradas')).toBe('Menu Criollo\n\nEntradas')
    expect(contenidoParaId('  hola  \n  chau  ')).toBe('hola\nchau')
  })

  it('conserva los saltos de línea, que sí son parte del mensaje', () => {
    expect(contenidoParaId('a\nb\nc')).toBe('a\nb\nc')
    expect(contenidoParaId('a\n\nb')).toBe('a\n\nb')
  })

  it('no toca un contenido ya limpio', () => {
    const limpio = 'Amor no te olvides enviar las facturas'
    expect(contenidoParaId(limpio)).toBe(limpio)
  })
})

describe('chatMessageId — el espaciado que el export pierde NO cambia el id', () => {
  // Esto es el bug medido el 29-jul: importar un export real de 113 mensajes
  // insertó 2 filas nuevas porque el .txt no puede preservar estos espacios.
  const id = (c: string) => chatMessageId('u1', 'p1', 'whatsapp', '2026-07-16T18:44:00Z', 'other', c)

  it('salto al final → mismo id', () => {
    expect(id('Recién leí tu mensaje\n')).toBe(id('Recién leí tu mensaje'))
  })

  it('línea interna con espacios → mismo id', () => {
    expect(id('Menu Criollo\n \nEntradas')).toBe(id('Menu Criollo\n\nEntradas'))
  })

  it('el id de un contenido limpio NO cambió (la 0176 sigue valiendo)', () => {
    // Si este hash cambiara, la migración 0176 habría dejado 285k ids inválidos.
    expect(chatMessageId('11111111-1111-1111-1111-111111111111', 'per_test_1', 'whatsapp',
      '2026-07-16T18:44:00.000Z', 'user', 'Amor no te olvides enviar las facturas'))
      .toBe('cm_429b2ea7e62749105a804abb28b2ca1fb248b187')
  })

  it('pero un texto REALMENTE distinto sigue dando id distinto', () => {
    expect(id('hola\nchau')).not.toBe(id('hola chau'))
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

// —— Mensajes SIN FECHA (1-ago-2026) ————————————————————————————————————
// Medido en la base: 30 mensajes del reader con `sent_at: null`, de 5 personas.
// Se guardaban en silencio y quedaban invisibles para el IAE, el detector de
// caída de afecto y el "último contacto". No se pueden reparar a posteriori
// (el desfase created_at−sent_at del reader tiene mediana de 3 días), así que
// lo único honesto es CONTARLOS para que se vean.
describe('mensajesSinFecha', () => {
  it('cuenta los que se van a guardar sin fecha', () => {
    expect(mensajesSinFecha([
      { iso: '2026-07-30T10:00:00Z', sender: 'user', content: 'con fecha' },
      { iso: null, sender: 'user', content: 'sin fecha' },
      { iso: null as unknown as string, sender: 'other', content: 'nula' },
    ])).toBe(2)
  })

  it('no cuenta los que ni se guardan (vacíos y no-media)', () => {
    expect(mensajesSinFecha([{ iso: null, sender: 'user', content: '' }])).toBe(0)
  })

  it('un media sin texto SÍ se guarda, así que sí cuenta', () => {
    expect(mensajesSinFecha([{ iso: null, sender: 'user', content: '', isMedia: true }])).toBe(1)
  })

  it('una fecha demasiado corta no es fecha', () => {
    expect(mensajesSinFecha([{ iso: '2026', sender: 'user', content: 'x' }])).toBe(1)
  })

  it('cero cuando todos tienen fecha, y no revienta con basura', () => {
    expect(mensajesSinFecha([{ iso: '2026-07-30T10:00:00Z', sender: 'user', content: 'x' }])).toBe(0)
    expect(mensajesSinFecha([])).toBe(0)
    expect(mensajesSinFecha(null as unknown as [])).toBe(0)
  })
})
