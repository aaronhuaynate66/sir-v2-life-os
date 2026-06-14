import { describe, it, expect } from 'vitest'
import { isBirthdayLabel, findBirthdaySpecialDate, nextOccurrence } from './birthdayDetect'
import type { SpecialDate } from '@/types'

describe('isBirthdayLabel', () => {
  it('reconoce cumpleaños/natalicio', () => {
    expect(isBirthdayLabel('Cumpleaños de Adrian Prochazka')).toBe(true)
    expect(isBirthdayLabel('cumple de Ana')).toBe(true)
  })
  it('NO confunde con el nacimiento de un tercero', () => {
    expect(isBirthdayLabel('Nacimiento de Emilio (hijo de Adrian)')).toBe(false)
    expect(isBirthdayLabel('Aniversario con Marilyn')).toBe(false)
  })
})

describe('findBirthdaySpecialDate', () => {
  const dates: SpecialDate[] = [
    { id: '1', label: 'Aniversario con Marilyn', date: '2025-03-16', recurring: true },
    { id: '2', label: 'Cumpleaños de Adrian Prochazka', date: '2025-12-11', recurring: true },
    { id: '3', label: 'Cumpleaños de la mamá', date: '2025-05-02', recurring: true },
  ]
  it('prioriza el que menciona al contacto', () => {
    expect(findBirthdaySpecialDate(dates, 'Adrian Prochazka')?.id).toBe('2')
  })
  it('sin nombre devuelve el primer cumpleaños', () => {
    expect(findBirthdaySpecialDate(dates)?.id).toBe('2')
  })
  it('null si no hay cumpleaños', () => {
    expect(findBirthdaySpecialDate([{ id: 'x', label: 'Mudanza', date: '2025-01-01', recurring: false }])).toBeNull()
  })
})

describe('nextOccurrence', () => {
  it('cuenta al próximo día/mes ignorando el año', () => {
    const occ = nextOccurrence('2020-12-11', new Date(2026, 11, 1)) // 1 dic 2026
    expect(occ).not.toBeNull()
    expect(occ!.daysUntil).toBe(10)
    expect(occ!.date.getMonth()).toBe(11)
    expect(occ!.date.getDate()).toBe(11)
  })
  it('si ya pasó este año, cuenta al del próximo', () => {
    const occ = nextOccurrence('2020-01-05', new Date(2026, 11, 31))
    expect(occ!.date.getFullYear()).toBe(2027)
  })
})
