// SIR V2 — Tests de resolveBirthdayInput.

import { describe, it, expect } from 'vitest'
import { resolveBirthdayInput, BIRTHDAY_FILLER_YEAR } from './birthdayInput'

describe('resolveBirthdayInput', () => {
  it('con año → modo birthDate con el año real', () => {
    const r = resolveBirthdayInput(9, 6, 1990)
    expect(r).toEqual({ ok: true, mode: 'birthDate', iso: '1990-06-09' })
  })

  it('sin año → modo special con año-relleno (nunca se muestra)', () => {
    const r = resolveBirthdayInput(9, 6, '')
    expect(r).toEqual({ ok: true, mode: 'special', iso: `${BIRTHDAY_FILLER_YEAR}-06-09` })
  })

  it('sin año trata null/undefined igual que vacío', () => {
    expect(resolveBirthdayInput(9, 6, null)).toMatchObject({ mode: 'special' })
    expect(resolveBirthdayInput(9, 6, undefined)).toMatchObject({ mode: 'special' })
  })

  it('acepta strings de inputs de formulario', () => {
    expect(resolveBirthdayInput('9', '6', '2001')).toEqual({ ok: true, mode: 'birthDate', iso: '2001-06-09' })
  })

  it('padea día y mes a 2 dígitos', () => {
    expect(resolveBirthdayInput(1, 3, 1988).ok && resolveBirthdayInput(1, 3, 1988)).toMatchObject({ iso: '1988-03-01' })
  })

  it('29-feb es válido sin año (año-relleno 2000 es bisiesto)', () => {
    expect(resolveBirthdayInput(29, 2, '')).toEqual({ ok: true, mode: 'special', iso: '2000-02-29' })
  })

  it('rechaza fechas que no existen (31-feb)', () => {
    expect(resolveBirthdayInput(31, 2, '')).toEqual({ ok: false, error: expect.stringContaining('no existe') })
  })

  it('rechaza 29-feb con año NO bisiesto (afirmarías una fecha falsa)', () => {
    expect(resolveBirthdayInput(29, 2, 1991)).toMatchObject({ ok: false })
  })

  it('rechaza mes / día fuera de rango', () => {
    expect(resolveBirthdayInput(9, 13, '')).toMatchObject({ ok: false })
    expect(resolveBirthdayInput(0, 6, '')).toMatchObject({ ok: false })
    expect(resolveBirthdayInput(32, 6, '')).toMatchObject({ ok: false })
  })

  it('rechaza faltantes', () => {
    expect(resolveBirthdayInput('', 6, '')).toMatchObject({ ok: false, error: expect.stringContaining('día y mes') })
    expect(resolveBirthdayInput(9, '', '')).toMatchObject({ ok: false })
  })

  it('respeta maxYear (año futuro daría edad negativa)', () => {
    expect(resolveBirthdayInput(9, 6, 2099, { maxYear: 2026 })).toMatchObject({ ok: false, error: expect.stringContaining('rango') })
    expect(resolveBirthdayInput(9, 6, 1800, { minYear: 1900 })).toMatchObject({ ok: false })
  })
})
