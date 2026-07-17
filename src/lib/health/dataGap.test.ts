import { describe, it, expect } from 'vitest'
import { healthDataGap, DEFAULT_GAP_DAYS } from './dataGap'

describe('healthDataGap — aviso de data faltante', () => {
  it('null si nunca hubo data', () => {
    expect(healthDataGap(null, '2026-07-20')).toBeNull()
  })

  it('null si está al día (< umbral)', () => {
    expect(healthDataGap('2026-07-20', '2026-07-20')).toBeNull() // 0 días
    expect(healthDataGap('2026-07-18', '2026-07-20')).toBeNull() // 2 días < 3
  })

  it('avisa al llegar al umbral (3 días)', () => {
    const t = healthDataGap('2026-07-17', '2026-07-20')
    expect(t).not.toBeNull()
    expect(t).toMatch(/3 días/)
    expect(t).toMatch(/17 jul/)
  })

  it('cuenta bien un gap largo', () => {
    const t = healthDataGap('2026-07-10', '2026-07-20')
    expect(t).toMatch(/10 días/)
  })

  it('respeta umbral custom', () => {
    expect(healthDataGap('2026-07-18', '2026-07-20', 5)).toBeNull() // 2 < 5
    expect(healthDataGap('2026-07-14', '2026-07-20', 5)).not.toBeNull() // 6 >= 5
  })

  it('fechas inválidas → null (no rompe el brief)', () => {
    expect(healthDataGap('basura', '2026-07-20')).toBeNull()
    expect(healthDataGap('2026-07-17', 'basura')).toBeNull()
  })

  it('DEFAULT_GAP_DAYS es 3', () => {
    expect(DEFAULT_GAP_DAYS).toBe(3)
  })
})
