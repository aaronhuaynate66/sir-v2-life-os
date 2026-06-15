import { describe, it, expect } from 'vitest'
import { parseThirdPartyMentions, placeholderName } from './mentionedPeople'
import type { SpecialDate } from '@/types'

const sd = (label: string, date = '2025-06-04'): SpecialDate => ({ id: 'sd_' + label.slice(0, 4), label, date, recurring: true } as SpecialDate)

describe('parseThirdPartyMentions', () => {
  it('caso con nombre y parentesco: "Nacimiento de Emilio (hijo de Adrian)"', () => {
    const m = parseThirdPartyMentions([sd('Nacimiento de Emilio (hijo de Adrian)')], 'Adrian Prochazca')
    expect(m).toHaveLength(1)
    expect(m[0].name).toBe('Emilio')
    expect(m[0].relationWord).toBe('hijo')
    expect(m[0].kind).toBe('hijo')
    expect(m[0].isBirthday).toBe(true)
    expect(m[0].dateISO).toBe('2025-06-04')
  })
  it('caso sin nombre: "Cumpleaños del sobrino de Adrian" → kind familiar, name null', () => {
    const m = parseThirdPartyMentions([sd('Cumpleaños del sobrino de Adrian')], 'Adrian Prochazca')
    expect(m).toHaveLength(1)
    expect(m[0].name).toBeNull()
    expect(m[0].relationWord).toBe('sobrino')
    expect(m[0].kind).toBe('familiar')
    expect(placeholderName(m[0], 'Adrian Prochazca')).toBe('Sobrino de Adrian')
  })
  it('NO propone el cumpleaños propio del contacto', () => {
    const m = parseThirdPartyMentions([sd('Cumpleaños de Adrian')], 'Adrian Prochazca')
    expect(m).toHaveLength(0)
  })
  it('mapea parentescos comunes', () => {
    const m = parseThirdPartyMentions([sd('Cumpleaños de la hija de Marita')], 'Marita Huaynate')
    expect(m[0].kind).toBe('hija')
  })
  it('sin special_dates → vacío', () => {
    expect(parseThirdPartyMentions(undefined, 'X')).toEqual([])
  })
})
