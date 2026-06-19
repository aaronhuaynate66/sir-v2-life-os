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
  it('NO propone eventos con paréntesis sin parentesco ("Llegada a Alicante (mudanza/viaje)")', () => {
    const r = parseThirdPartyMentions([{ id: '1', label: 'Llegada a Alicante (mudanza/viaje)', date: '2026-07-01', recurring: false }], 'Nicolle')
    expect(r).toEqual([])
  })
  it('NO propone eventos sobre el propio contacto ("Nicolle sale de vacaciones (martes)")', () => {
    const r = parseThirdPartyMentions([{ id: '2', label: 'Nicolle sale de vacaciones (martes)', date: '2026-07-08', recurring: false }], 'Nicolle Huaynate')
    expect(r).toEqual([])
  })
  it('sigue proponiendo cuando el paréntesis SÍ trae parentesco', () => {
    const r = parseThirdPartyMentions([{ id: '3', label: 'Nacimiento de Emilio (hijo de Adrian)', date: '2025-06-04', recurring: false }], 'Adrian')
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Emilio')
  })
  it('sin special_dates → vacío', () => {
    expect(parseThirdPartyMentions(undefined, 'X')).toEqual([])
  })
})

import { dedupeMentions, findExistingByName, mentionKey } from './mentionedPeople'
import type { MentionedPerson } from './mentionedPeople'

const mk = (over: Partial<MentionedPerson>): MentionedPerson => ({
  sourceId: 's1', rawLabel: 'x', name: null, relationWord: null,
  kind: 'familiar', dateISO: '2025-06-04', isBirthday: true, ...over,
})

describe('dedupeMentions', () => {
  it('colapsa dos menciones del mismo nombre (Emilio x2)', () => {
    const out = dedupeMentions([
      mk({ sourceId: 'a', name: 'Emilio', kind: 'hijo' }),
      mk({ sourceId: 'b', name: 'Emilio', kind: 'hijo' }),
    ])
    expect(out).toHaveLength(1)
  })

  it('colapsa el sobrino sin nombre a uno solo', () => {
    const out = dedupeMentions([
      mk({ sourceId: 'a', name: null, relationWord: 'sobrino', isBirthday: false }),
      mk({ sourceId: 'b', name: null, relationWord: 'sobrino', isBirthday: true }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].isBirthday).toBe(true) // prefiere el que trae cumple
  })

  it('mantiene personas distintas separadas', () => {
    const out = dedupeMentions([
      mk({ name: 'Emilio' }), mk({ name: 'Mateo' }),
    ])
    expect(out).toHaveLength(2)
  })
})

describe('findExistingByName', () => {
  const people = [{ id: 'p1', name: 'Emilio Prochazka' }, { id: 'p2', name: 'Diana Diaz' }]
  it('encuentra por subconjunto de tokens (Emilio → Emilio Prochazka)', () => {
    expect(findExistingByName('Emilio', people)?.id).toBe('p1')
  })
  it('no matchea nombres genéricos cortos / null', () => {
    expect(findExistingByName(null, people)).toBeNull()
    expect(findExistingByName('Mateo', people)).toBeNull()
  })
})

describe('mentionKey', () => {
  it('mismo key para el mismo nombre, distinto entre personas', () => {
    expect(mentionKey(mk({ name: 'Emilio' }))).toBe(mentionKey(mk({ name: 'emilio' })))
    expect(mentionKey(mk({ name: 'Emilio' }))).not.toBe(mentionKey(mk({ name: 'Mateo' })))
  })
})
