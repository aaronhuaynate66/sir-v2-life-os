import { describe, expect, it } from 'vitest'

import { buildIdentityCard, cuandoLaVi } from './askIdentity'

const AHORA = Date.parse('2026-08-05T02:23:00Z') // 4-ago 21:23 de Lima

describe('cuandoLaVi', () => {
  it('EL CASO REAL: @pierolq, vista el 30-jul y preguntada el 4-ago', () => {
    // Aaron reportó esto como una contradicción de SIR. No lo era: la historia
    // tenía 5 días y la tarjeta no lo decía.
    //
    // Y el número CALZA con el otro mensaje: el brief de la mañana siguiente dijo
    // "Instagram no trae nada hace 5 días". Con la fecha puesta, los dos mensajes
    // dicen lo mismo en vez de parecer que se contradicen.
    expect(cuandoLaVi('2026-07-30T14:06:35.913+00:00', AHORA)).toBe('hace 5 días')
  })

  it('lo de hoy dice hoy', () => {
    expect(cuandoLaVi('2026-08-04T18:00:00-05:00', AHORA)).toBe('hoy')
  })

  it('cuenta días de CALENDARIO, no horas', () => {
    // Ayer 23:00 es "ayer" aunque hayan pasado menos de 24 h.
    expect(cuandoLaVi('2026-08-03T23:00:00-05:00', AHORA)).toBe('ayer')
    // Y hoy 00:30 es "hoy" aunque hayan pasado casi 21 h.
    expect(cuandoLaVi('2026-08-04T00:30:00-05:00', AHORA)).toBe('hoy')
  })

  it('entre 2 y 6 días cuenta los días', () => {
    expect(cuandoLaVi('2026-08-02T12:00:00-05:00', AHORA)).toBe('hace 2 días')
    expect(cuandoLaVi('2026-07-30T12:00:00-05:00', AHORA)).toBe('hace 5 días')
    expect(cuandoLaVi('2026-07-29T12:00:00-05:00', AHORA)).toBe('hace 6 días')
  })

  it('a partir de una semana da la fecha, que es más útil que "hace 23 días"', () => {
    expect(cuandoLaVi('2026-07-28T12:00:00-05:00', AHORA)).toBe('el 28 de julio')
    expect(cuandoLaVi('2026-06-01T12:00:00-05:00', AHORA)).toBe('el 1 de junio')
  })

  it('sin fecha o con fecha rota devuelve vacío en vez de inventar', () => {
    expect(cuandoLaVi(null, AHORA)).toBe('')
    expect(cuandoLaVi(undefined, AHORA)).toBe('')
    expect(cuandoLaVi('cualquier cosa', AHORA)).toBe('')
  })

  it('una fecha futura no dice "hace -1 días"', () => {
    expect(cuandoLaVi('2026-08-06T12:00:00-05:00', AHORA)).toBe('hoy')
  })
})

describe('buildIdentityCard', () => {
  const base = { id: 'usa_1', handle: 'pierolq', hint: 'Piero Antonio López Quintana' }

  it('la tarjeta que Aaron recibió ahora dice de cuándo es', () => {
    const { caption } = buildIdentityCard({ ...base, observedAt: '2026-07-30T14:06:35.913+00:00' }, AHORA)
    expect(caption).toContain('👀 Vi hace 5 días una historia de @pierolq')
  })

  it('lo viejo de verdad sale con fecha, no con un número grande', () => {
    const { caption } = buildIdentityCard({ ...base, observedAt: '2026-06-20T10:00:00-05:00' }, AHORA)
    expect(caption).toContain('👀 Vi el 20 de junio una historia de @pierolq')
  })

  it('sin observed_at queda como antes — no se inventa una fecha', () => {
    const { caption } = buildIdentityCard(base, AHORA)
    expect(caption).toContain('👀 Vi una historia de @pierolq y no sé de quién es.')
  })

  it('el @handle sigue en el pie: el webhook lo saca de ahí para matchear la respuesta', () => {
    const { caption } = buildIdentityCard({ ...base, observedAt: '2026-08-04T18:00:00-05:00' }, AHORA)
    expect(caption).toContain('@pierolq')
    expect(caption).toContain('👀 Vi hoy una historia de @pierolq')
  })
})
