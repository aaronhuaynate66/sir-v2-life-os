import { describe, expect, it } from 'vitest'

import { motivoSinToken } from './feed'

describe('motivoSinToken — tres causas, tres mensajes', () => {
  it('nunca se conectó: manda a conectar, que es lo que sirve', () => {
    const m = motivoSinToken({ refreshToken: null })
    expect(m).toContain('nunca se completó')
    expect(m).toContain('/horario')
  })

  it('con token guardado NO ordena reconectar a secas', () => {
    // El 5-ago-2026 el mensaje viejo decía siempre "reconecta el calendario".
    // Aaron reconectó el OAuth para nada: su calendario estaba perfecto y lo que
    // fallaba era que YO leía desde local sin la clave de cifrado de producción.
    const m = motivoSinToken({ refreshToken: 'algo-cifrado' })
    expect(m).toContain('no se pudo usar')
    // Dice las dos posibilidades, en vez de mandar a hacer algo que puede no servir.
    expect(m).toContain('revocara')
    expect(m).toContain('cifró')
    expect(m).toContain('no hay nada que reconectar')
  })

  it('los dos mensajes son distintos — era el bug', () => {
    expect(motivoSinToken({ refreshToken: null })).not.toBe(motivoSinToken({ refreshToken: 'x' }))
  })

  it('un refresh_token vacío cuenta como "nunca se conectó"', () => {
    expect(motivoSinToken({ refreshToken: '' })).toContain('nunca se completó')
    expect(motivoSinToken({})).toContain('nunca se completó')
  })
})
