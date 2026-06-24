import { describe, it, expect } from 'vitest'
import { namesLooselyMatch, chatPersonMismatch } from './nameMatch'

describe('namesLooselyMatch', () => {
  it('comparten token', () => {
    expect(namesLooselyMatch('Nicolle Huaynate Espinoza', 'Nicolle Maria Huaynate Espinoza')).toBe(true)
  })
  it('distintos', () => {
    expect(namesLooselyMatch('Marita Irmalia Menu Delivery', 'Nicolle Maria Huaynate Espinoza')).toBe(false)
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
