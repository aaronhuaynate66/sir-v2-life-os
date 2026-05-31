// SIR V2 — Tests de parseLocalDate / toIsoLocal.
//
// El contrato (TZ-independiente, por eso testeable en cualquier runner):
// los componentes LOCALES del Date devuelto SIEMPRE igualan el Y-M-D de
// entrada. Eso es justo lo que evita el off-by-one de Lima (UTC-5):
// `new Date('2026-05-30')` daría medianoche UTC -> 29-may local; este helper
// garantiza 30-may local en cualquier zona.

import { describe, it, expect } from 'vitest'

import { parseLocalDate, toIsoLocal } from './parseLocalDate'

describe('parseLocalDate', () => {
  it('parsea YYYY-MM-DD a medianoche local con componentes EXACTOS', () => {
    const d = parseLocalDate('2026-05-30')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(4) // mayo (0-indexed)
    expect(d!.getDate()).toBe(30)
    expect(d!.getHours()).toBe(0)
    expect(d!.getMinutes()).toBe(0)
  })

  it('acepta el prefijo date-only de un timestamp completo', () => {
    const d = parseLocalDate('2026-01-15T22:00:00.000Z')
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(0)
    expect(d!.getDate()).toBe(15)
  })

  it('rechaza null/undefined/"" -> null', () => {
    expect(parseLocalDate(null)).toBeNull()
    expect(parseLocalDate(undefined)).toBeNull()
    expect(parseLocalDate('')).toBeNull()
  })

  it('rechaza strings sin fecha al inicio', () => {
    expect(parseLocalDate('garbage')).toBeNull()
    expect(parseLocalDate('30-05-2026')).toBeNull()
    expect(parseLocalDate('2026/05/30')).toBeNull()
  })

  it('rechaza fechas imposibles por round-trip (feb-30, mes 13)', () => {
    expect(parseLocalDate('2026-02-30')).toBeNull()
    expect(parseLocalDate('2026-13-01')).toBeNull()
    expect(parseLocalDate('2026-00-10')).toBeNull()
  })

  it('feb-29 en año NO bisiesto -> null; en bisiesto -> válido', () => {
    expect(parseLocalDate('2026-02-29')).toBeNull() // 2026 no bisiesto
    const leap = parseLocalDate('2024-02-29') // 2024 bisiesto
    expect(leap).not.toBeNull()
    expect(leap!.getMonth()).toBe(1)
    expect(leap!.getDate()).toBe(29)
  })
})

describe('toIsoLocal', () => {
  it('serializa componentes locales con zero-padding', () => {
    expect(toIsoLocal(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toIsoLocal(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('round-trip: toIsoLocal(parseLocalDate(x)) === x para fechas válidas', () => {
    for (const iso of ['2026-05-30', '2024-02-29', '1990-06-14', '2026-01-01']) {
      expect(toIsoLocal(parseLocalDate(iso)!)).toBe(iso)
    }
  })
})
