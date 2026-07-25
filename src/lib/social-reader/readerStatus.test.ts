// SIR V2 — Tests de la capa pura del estado del reader social.

import { describe, it, expect } from 'vitest'
import { isReaderQuery, renderReaderStatusBlock } from './readerStatus'

describe('isReaderQuery', () => {
  it('detecta la pregunta original de Aaron (Instagram)', () => {
    expect(isReaderQuery('¿Desde cuándo no recibes información de Instagram?')).toBe(true)
  })
  it('detecta el follow-up sobre historias', () => {
    expect(isReaderQuery('No, me refiero a las historias de Instagram')).toBe(true)
  })
  it('detecta reader, redes, linkedin, stories', () => {
    expect(isReaderQuery('¿cómo va el reader?')).toBe(true)
    expect(isReaderQuery('¿qué ves de las redes sociales?')).toBe(true)
    expect(isReaderQuery('novedades de LinkedIn')).toBe(true)
    expect(isReaderQuery('viste alguna story hoy?')).toBe(true)
  })
  it('detecta "ig"/"insta" como palabra pero no dentro de otra', () => {
    expect(isReaderQuery('algo nuevo en IG?')).toBe(true)
    expect(isReaderQuery('mira mi insta')).toBe(true)
    expect(isReaderQuery('el litigio sigue abierto')).toBe(false) // "litigio" contiene "ig"
  })
  it('ignora preguntas ajenas al reader', () => {
    expect(isReaderQuery('¿cómo voy con la mudanza?')).toBe(false)
    expect(isReaderQuery('recuérdame llamar al banco')).toBe(false)
  })
})

describe('renderReaderStatusBlock', () => {
  const now = '2026-07-24T18:00:00Z'

  it('con data: afirma que está integrado, da conteos y última señal', () => {
    const block = renderReaderStatusBlock(
      { unmatchedCount: 101, contactActivityCount: 24, lastSignalISO: '2026-07-24T09:00:00Z' },
      now,
    )
    expect(block).toContain('INTEGRADO Y ACTIVO')
    expect(block).toContain('101 cuenta(s) de Instagram')
    expect(block).toContain('24 señal(es) de actividad')
    expect(block).toContain('2026-07-24')
    expect(block).toContain('hoy')
    // La instrucción anti-negación DEBE estar presente.
    expect(block).toContain('nunca se integró')
    expect(block).toContain('NO mensajes directos (DMs)')
  })

  it('marca la antigüedad de la última señal', () => {
    const block = renderReaderStatusBlock(
      { unmatchedCount: 5, contactActivityCount: 0, lastSignalISO: '2026-07-23T09:00:00Z' },
      now,
    )
    expect(block).toContain('2026-07-23')
    expect(block).toContain('ayer')
  })

  it('usa observed_at si created_at no vino (solo lastSignalISO importa)', () => {
    const block = renderReaderStatusBlock(
      { unmatchedCount: 3, contactActivityCount: 0, lastSignalISO: '2026-07-20T00:00:00Z' },
      now,
    )
    expect(block).toContain('2026-07-20')
    expect(block).toContain('hace 4 días')
  })

  it('sin data: honesto — integrado pero sin señales, sin negar que existe', () => {
    const block = renderReaderStatusBlock(
      { unmatchedCount: 0, contactActivityCount: 0, lastSignalISO: null },
      now,
    )
    expect(block).toContain('INTEGRADO Y ACTIVO')
    expect(block).toContain('AÚN NO ha mandado señales')
    expect(block).toContain('nunca se integró') // instrucción de NO decirlo
    // No debe inventar cifras cuando no hay data.
    expect(block).not.toContain('cuenta(s) de Instagram vistas por el reader que AÚN NO')
  })
})
