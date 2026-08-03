import { describe, it, expect } from 'vitest'
import { contactWasFollowed, contactSuggestionSeed, sugerenciasIgnoradas, DIAS_PARA_IGNORADA } from './outcome'

describe('contactWasFollowed', () => {
  const since = '2026-07-20T10:00:00Z'
  it('true si hay una interacción posterior a la sugerencia', () => {
    expect(contactWasFollowed(since, ['2026-07-21T09:00:00Z'])).toBe(true)
  })
  it('false si la interacción es ANTERIOR', () => {
    expect(contactWasFollowed(since, ['2026-07-19T09:00:00Z'])).toBe(false)
  })
  it('cuenta la interacción casi simultánea (margen 60s)', () => {
    expect(contactWasFollowed(since, ['2026-07-20T09:59:30Z'])).toBe(true)
  })
  it('ignora timestamps nulos/basura y false si no hay ninguno válido', () => {
    expect(contactWasFollowed(since, [null, undefined, 'basura'])).toBe(false)
  })
  it('false si since no parsea', () => {
    expect(contactWasFollowed('x', ['2026-07-21T09:00:00Z'])).toBe(false)
  })
})

describe('contactSuggestionSeed', () => {
  it('es estable por (user, persona, día)', () => {
    expect(contactSuggestionSeed('u1', 'p1', '2026-07-21')).toBe('u1|contact|p1|2026-07-21')
    expect(contactSuggestionSeed('u1', 'p1', '2026-07-21')).toBe(contactSuggestionSeed('u1', 'p1', '2026-07-21'))
    expect(contactSuggestionSeed('u1', 'p1', '2026-07-22')).not.toBe(contactSuggestionSeed('u1', 'p1', '2026-07-21'))
  })
})

// ═══ EL LADO NEGATIVO DEL LOOP ═══
// Medido el 3-ago: 15 filas en el ledger y `outcome` null en TODAS, la más vieja del
// 22-jul. El cierre automático solo sabía cerrar el éxito, así que 11 de 12
// sugerencias de contacto se quedaban pendientes para siempre y el cerebro no
// recibía ninguna señal.
describe('sugerenciasIgnoradas', () => {
  const HOY = new Date('2026-08-03T12:00:00Z')
  const hace = (dias: number) => new Date(HOY.getTime() - dias * 86_400_000).toISOString()

  it('cierra las que pasaron el plazo y deja las frescas', () => {
    const r = sugerenciasIgnoradas(
      [
        { id: 'vieja', createdAt: hace(12) },
        { id: 'justo', createdAt: hace(DIAS_PARA_IGNORADA) },
        { id: 'fresca', createdAt: hace(2) },
        { id: 'hoy', createdAt: hace(0) },
      ],
      HOY,
    )
    expect(r).toEqual(['vieja', 'justo'])
  })

  it('una sugerencia de 6 días NO se cierra: el brief del lunes se puede actuar el jueves', () => {
    expect(sugerenciasIgnoradas([{ id: 'a', createdAt: hace(6) }], HOY)).toEqual([])
  })

  it('sin fecha parseable no cierra: inventar un outcome envenenaría el aprendizaje', () => {
    expect(sugerenciasIgnoradas([{ id: 'a', createdAt: 'ayer nomás' }], HOY)).toEqual([])
    expect(sugerenciasIgnoradas([{ id: 'a', createdAt: '' }], HOY)).toEqual([])
  })

  it('no revienta con basura', () => {
    expect(sugerenciasIgnoradas([], HOY)).toEqual([])
    // @ts-expect-error entrada inválida a propósito
    expect(sugerenciasIgnoradas(null, HOY)).toEqual([])
    // @ts-expect-error entrada inválida a propósito
    expect(sugerenciasIgnoradas([null, { id: '', createdAt: hace(30) }], HOY)).toEqual([])
  })

  it('el plazo declarado son 7 días', () => {
    expect(DIAS_PARA_IGNORADA).toBe(7)
  })
})
