import { describe, it, expect } from 'vitest'

import {
  storedToPreset,
  presetToStored,
  parseCustomDays,
  describeCadence,
  cadenceStatus,
} from './cadence'

describe('storedToPreset', () => {
  it('vacío → auto', () => {
    expect(storedToPreset('')).toBe('auto')
    expect(storedToPreset(null)).toBe('auto')
    expect(storedToPreset('  ')).toBe('auto')
  })
  it('palabra conocida → esa palabra (case-insensitive)', () => {
    expect(storedToPreset('semanal')).toBe('semanal')
    expect(storedToPreset('Mensual')).toBe('mensual')
  })
  it('cualquier otra cosa → custom', () => {
    expect(storedToPreset('cada 10 días')).toBe('custom')
    expect(storedToPreset('monthly')).toBe('custom')
  })
})

describe('presetToStored', () => {
  it('auto → vacío', () => {
    expect(presetToStored('auto')).toBe('')
  })
  it('palabra → misma palabra', () => {
    expect(presetToStored('quincenal')).toBe('quincenal')
  })
  it('custom → "cada N días" acotado a 1..365', () => {
    expect(presetToStored('custom', 21)).toBe('cada 21 días')
    expect(presetToStored('custom', 0)).toBe('cada 1 días')
    expect(presetToStored('custom', 999)).toBe('cada 365 días')
    expect(presetToStored('custom')).toBe('cada 21 días') // default
  })
})

describe('parseCustomDays', () => {
  it('extrae N de "cada N días"', () => {
    expect(parseCustomDays('cada 10 días')).toBe(10)
    expect(parseCustomDays('cada 3 dias')).toBe(3)
  })
  it('null si no matchea', () => {
    expect(parseCustomDays('semanal')).toBeNull()
    expect(parseCustomDays('')).toBeNull()
  })
})

describe('describeCadence', () => {
  it('explícita: usa el texto', () => {
    const d = describeCadence('semanal', 'network')
    expect(d.days).toBe(7)
    expect(d.isAuto).toBe(false)
    expect(d.label).toBe('cada 7 días')
  })
  it('automática (vacío): cae al default por categoría, marca auto', () => {
    const d = describeCadence('', 'inner_circle')
    expect(d.days).toBe(7) // default inner_circle
    expect(d.isAuto).toBe(true)
    expect(d.label).toBe('cada 7 días · auto')
  })
  it('categorías distintas dan defaults distintos', () => {
    expect(describeCadence('', 'network').days).toBe(30)
    expect(describeCadence('', 'peripheral').days).toBe(60)
  })
})

describe('cadenceStatus', () => {
  it('sin contacto registrado → sin_registro', () => {
    expect(cadenceStatus(null, 7).state).toBe('sin_registro')
  })
  it('dentro de la meta → al_dia', () => {
    const s = cadenceStatus(5, 7)
    expect(s.state).toBe('al_dia')
    expect(s.overdueDays).toBe(0)
    expect(s.label).toBe('al día')
  })
  it('justo en la meta → al_dia (no atrasado)', () => {
    expect(cadenceStatus(7, 7).state).toBe('al_dia')
  })
  it('pasada la meta → atrasado con los días de exceso', () => {
    const s = cadenceStatus(20, 7)
    expect(s.state).toBe('atrasado')
    expect(s.overdueDays).toBe(13)
    expect(s.label).toBe('atrasado 13d')
  })
})
