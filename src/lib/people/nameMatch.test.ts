import { describe, it, expect } from 'vitest'
import { namesLooselyMatch, chatPersonMismatch } from './nameMatch'

describe('namesLooselyMatch', () => {
  it('comparten token', () => {
    expect(namesLooselyMatch('Nicolle Huaynate Espinoza', 'Nicolle Maria Huaynate Espinoza')).toBe(true)
  })
  it('distintos', () => {
    expect(namesLooselyMatch('Marita Irmalia Menu Delivery', 'Nicolle Maria Huaynate Espinoza')).toBe(false)
  })
  it('NO matchea por un solo nombre en común (bug Carolina 2026-07-16)', () => {
    // "Carolina Insider One" y "Diana Carolina Díaz Sánchez" comparten solo "carolina"
    // → NO son la misma persona; antes se cruzaban.
    expect(namesLooselyMatch('Carolina Insider One', 'Diana Carolina Díaz Sánchez')).toBe(false)
    expect(namesLooselyMatch('Juan Gomez', 'Juan Perez')).toBe(false)
  })
  it('SÍ matchea con ≥2 tokens en común (Diana Carolina real)', () => {
    expect(namesLooselyMatch('Diana Carolina ❣️', 'Diana Carolina Díaz Sánchez')).toBe(true)
  })
  it('SÍ matchea acortamiento (contención textual)', () => {
    expect(namesLooselyMatch('Marita', 'Marita Irmalia Menu Delivery')).toBe(true)
  })
})
describe('chatPersonMismatch', () => {
  it('flag cuando el chat es de otra persona', () => {
    expect(chatPersonMismatch('Marita Irmalia Menu Delivery', 'Nicolle Maria Huaynate Espinoza')).toBe(true)
  })
  it('ok si coincide por nombre', () => {
    expect(chatPersonMismatch('Nicolle Huaynate Espinoza', 'Nicolle Maria Huaynate Espinoza')).toBe(false)
  })
  it('ok si coincide por alias (Papa → Esteban)', () => {
    expect(chatPersonMismatch('Papa', 'Esteban Humberto Huaynate Pachas', ['Papa'])).toBe(false)
  })
  it('sin nombre de chat no molesta', () => {
    expect(chatPersonMismatch('', 'Quien sea')).toBe(false)
  })
})
