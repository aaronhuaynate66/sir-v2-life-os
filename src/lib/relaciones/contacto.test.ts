import { describe, expect, it } from 'vitest'

import { contactoMasReciente } from './contacto'

describe('el caso REAL de Diana (6-ago-2026)', () => {
  // `people.last_contact` estaba en el 29-jul porque el reader nunca lo escribía;
  // su último mensaje era de esa misma noche a las 22:32. El score la castigaba por
  // una semana de silencio que no existió.
  const LAST_CONTACT = '2026-07-29'
  const ULTIMO_MENSAJE = '2026-08-07T03:32:04+00:00' // 6-ago 22:32 de Lima

  it('gana el sustrato cuando `last_contact` está atrasado', () => {
    expect(contactoMasReciente(ULTIMO_MENSAJE, LAST_CONTACT)).toBe(ULTIMO_MENSAJE)
  })

  it('el orden de los argumentos no cambia el resultado', () => {
    expect(contactoMasReciente(LAST_CONTACT, ULTIMO_MENSAJE)).toBe(ULTIMO_MENSAJE)
  })
})

describe('cuando la ventana del sustrato viene vacía', () => {
  it('gana `last_contact`: la ventana reciente no ve lejos', () => {
    // Alguien con quien no habla en meses: `chat_messages` de la ventana reciente
    // no trae nada, y ahí el campo viejo es el mejor dato que hay.
    expect(contactoMasReciente(null, '2026-02-14')).toBe('2026-02-14')
    expect(contactoMasReciente(undefined, '2026-02-14')).toBe('2026-02-14')
  })

  it('sin ninguna fuente devuelve null, no una fecha inventada', () => {
    expect(contactoMasReciente(null, null)).toBeNull()
    expect(contactoMasReciente()).toBeNull()
    expect(contactoMasReciente('', '   ')).toBeNull()
  })
})

describe('no se envenena con basura', () => {
  it('una fecha inválida se descarta y no gana', () => {
    expect(contactoMasReciente('no-es-fecha', '2026-08-01')).toBe('2026-08-01')
    expect(contactoMasReciente('2026-08-01', 'no-es-fecha')).toBe('2026-08-01')
  })

  it('todo inválido devuelve null', () => {
    expect(contactoMasReciente('ayer', 'hace poco')).toBeNull()
  })

  it('acepta más de dos fuentes', () => {
    expect(contactoMasReciente('2026-07-01', '2026-08-06T12:00:00Z', '2026-07-29'))
      .toBe('2026-08-06T12:00:00Z')
  })

  it('compara bien entre formatos con y sin offset', () => {
    // 6-ago 22:32 de Lima = 7-ago 03:32Z. Contra un date-only del 7-ago (medianoche
    // UTC), el instante con offset es POSTERIOR y tiene que ganar.
    expect(contactoMasReciente('2026-08-07', '2026-08-07T03:32:04+00:00'))
      .toBe('2026-08-07T03:32:04+00:00')
  })
})
