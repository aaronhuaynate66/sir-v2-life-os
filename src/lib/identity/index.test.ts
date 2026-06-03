import { describe, it, expect } from 'vitest'
import type { SpecialDate } from '@/types'
import {
  emptyIdentityProfile,
  isIdentityEmpty,
  normalizeIdentityProfile,
  computeAge,
  type IdentityProfile,
} from './index'

describe('emptyIdentityProfile', () => {
  it('crea un perfil vacío con el id dado y epoch como updatedAt', () => {
    const p = emptyIdentityProfile('idn_1')
    expect(p.id).toBe('idn_1')
    expect(p.fullName).toBe('')
    expect(p.birthDate).toBeNull()
    expect(p.roles).toEqual([])
    expect(p.location).toBe('')
    expect(p.specialDates).toEqual([])
    expect(new Date(p.updatedAt).getTime()).toBe(0)
  })
})

describe('isIdentityEmpty', () => {
  it('true para null/undefined y para el perfil vacío', () => {
    expect(isIdentityEmpty(null)).toBe(true)
    expect(isIdentityEmpty(undefined)).toBe(true)
    expect(isIdentityEmpty(emptyIdentityProfile('idn_1'))).toBe(true)
  })

  it('no cuenta las fechas importantes: con solo fechas sigue vacío', () => {
    const p = emptyIdentityProfile('idn_1')
    p.specialDates = [{ id: 'sd1', label: 'Aniversario', date: '2020-01-01', recurring: true }]
    expect(isIdentityEmpty(p)).toBe(true)
  })

  it('false si hay nombre, fecha de nacimiento, rol o ubicación', () => {
    const base = emptyIdentityProfile('idn_1')
    expect(isIdentityEmpty({ ...base, fullName: 'Aaron' })).toBe(false)
    expect(isIdentityEmpty({ ...base, birthDate: '1990-05-30' })).toBe(false)
    expect(isIdentityEmpty({ ...base, roles: ['Bombero'] })).toBe(false)
    expect(isIdentityEmpty({ ...base, location: 'Lima, Perú' })).toBe(false)
  })
})

describe('normalizeIdentityProfile', () => {
  it('recorta textos y deduplica/limpia roles preservando orden', () => {
    const draft: IdentityProfile = {
      id: 'idn_1',
      fullName: '  Aaron Huaynate  ',
      birthDate: '1990-05-30',
      roles: ['Bombero', '  Fundador  ', 'Bombero', '   ', 'Atleta'],
      location: '  Lima, Perú ',
      specialDates: [],
      updatedAt: new Date(0).toISOString(),
    }
    const clean = normalizeIdentityProfile(draft)
    expect(clean.fullName).toBe('Aaron Huaynate')
    expect(clean.roles).toEqual(['Bombero', 'Fundador', 'Atleta'])
    expect(clean.location).toBe('Lima, Perú')
  })

  it('descarta una fecha de nacimiento inválida (queda null)', () => {
    const draft = { ...emptyIdentityProfile('idn_1'), birthDate: '2026-02-30' }
    expect(normalizeIdentityProfile(draft).birthDate).toBeNull()
  })

  it('recorta un timestamp completo a date-only', () => {
    const draft = { ...emptyIdentityProfile('idn_1'), birthDate: '1990-05-30T12:00:00.000Z' }
    expect(normalizeIdentityProfile(draft).birthDate).toBe('1990-05-30')
  })

  it('preserva las fechas importantes tal cual', () => {
    const dates: SpecialDate[] = [
      { id: 'sd1', label: 'Mi aniversario', date: '2018-09-12', recurring: true },
    ]
    const draft = { ...emptyIdentityProfile('idn_1'), specialDates: dates }
    expect(normalizeIdentityProfile(draft).specialDates).toEqual(dates)
  })
})

describe('computeAge', () => {
  // Referencia fija: 3 de junio de 2026 (hora local).
  const now = new Date(2026, 5, 3)

  it('devuelve null sin fecha o con fecha inválida', () => {
    expect(computeAge(null, now)).toBeNull()
    expect(computeAge(undefined, now)).toBeNull()
    expect(computeAge('no-es-fecha', now)).toBeNull()
    expect(computeAge('2026-02-30', now)).toBeNull()
  })

  it('cuenta los años cumplidos cuando el cumple ya pasó este año', () => {
    expect(computeAge('1990-01-15', now)).toBe(36)
  })

  it('resta un año cuando el cumple aún no llegó este año', () => {
    expect(computeAge('1990-12-25', now)).toBe(35)
  })

  it('el día del cumpleaños ya cuenta el año recién cumplido', () => {
    expect(computeAge('2000-06-03', now)).toBe(26)
  })

  it('el día anterior al cumpleaños todavía no lo cuenta', () => {
    expect(computeAge('2000-06-04', now)).toBe(25)
  })

  it('null para fecha futura o año < 1900', () => {
    expect(computeAge('2030-01-01', now)).toBeNull()
    expect(computeAge('1899-01-01', now)).toBeNull()
  })

  it('parsea en TZ local (no corre el día en Lima)', () => {
    // Nacido el 3 de junio de 2000: a medianoche local de su cumple #26.
    expect(computeAge('2000-06-03', new Date(2026, 5, 3))).toBe(26)
  })
})
