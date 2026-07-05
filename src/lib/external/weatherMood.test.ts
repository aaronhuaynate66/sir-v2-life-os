// SIR V2 — Tests 18·M2: clima → energía/ánimo.

import { describe, it, expect } from 'vitest'
import { assessWeatherMood, isGrayDay, type WeatherObservation, type EnergyPoint } from './weatherMood'

function grayWeek(dates: string[]): WeatherObservation[] {
  return dates.map((date) => ({ date, code: 45, precipMm: 0 }))
}

describe('isGrayDay', () => {
  it('cuenta cubierto, garúa y precip como gris; despejado no', () => {
    expect(isGrayDay({ date: '2026-07-01', code: 3, precipMm: 0 })).toBe(true)
    expect(isGrayDay({ date: '2026-07-01', code: 51, precipMm: 0 })).toBe(true)
    expect(isGrayDay({ date: '2026-07-01', code: 1, precipMm: 2 })).toBe(true)
    expect(isGrayDay({ date: '2026-07-01', code: 0, precipMm: 0 })).toBe(false)
    expect(isGrayDay({ date: '2026-07-01', code: 1, precipMm: 0 })).toBe(false)
  })
})

describe('assessWeatherMood', () => {
  it('insuficiente con pocos días de clima', () => {
    const s = assessWeatherMood(grayWeek(['2026-07-01', '2026-07-02']), [])
    expect(s.state).toBe('insufficient')
    expect(s.note).toBeNull()
  })

  it('racha gris + bajón de energía → nota honesta de contexto', () => {
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06']
    // 5 grises + 1 despejado
    const weather: WeatherObservation[] = [
      ...grayWeek(dates.slice(0, 5)),
      { date: dates[5], code: 0, precipMm: 0 },
    ]
    const energy: EnergyPoint[] = [
      { date: dates[0], value: 4 },
      { date: dates[1], value: 4 },
      { date: dates[2], value: 5 },
      { date: dates[3], value: 4 },
      { date: dates[4], value: 3 },
      { date: dates[5], value: 7 }, // despejado, mejor
    ]
    const s = assessWeatherMood(weather, energy)
    expect(s.state).toBe('gray_streak')
    expect(s.grayDays).toBe(5)
    expect(s.energyDelta).not.toBeNull()
    expect(s.energyDelta! < 0).toBe(true)
    expect(s.note).toMatch(/CONTEXTO de un bajón, no la causa/)
    expect(s.note).toMatch(/no decide tu día/)
  })

  it('racha gris SIN bajón → no molesta (nota null)', () => {
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06']
    const weather: WeatherObservation[] = [
      ...grayWeek(dates.slice(0, 5)),
      { date: dates[5], code: 0, precipMm: 0 },
    ]
    const energy: EnergyPoint[] = dates.map((date) => ({ date, value: 7 })) // energía estable alta
    const s = assessWeatherMood(weather, energy)
    expect(s.state).toBe('gray_streak')
    expect(s.note).toBeNull()
  })

  it('clima mixto (pocos grises) → no es señal', () => {
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05']
    const weather: WeatherObservation[] = [
      { date: dates[0], code: 45, precipMm: 0 },
      { date: dates[1], code: 0, precipMm: 0 },
      { date: dates[2], code: 0, precipMm: 0 },
      { date: dates[3], code: 1, precipMm: 0 },
      { date: dates[4], code: 0, precipMm: 0 },
    ]
    const s = assessWeatherMood(weather, energy(dates))
    expect(s.state).toBe('mixed')
    expect(s.note).toBeNull()
  })
})

function energy(dates: string[]): EnergyPoint[] {
  return dates.map((date, i) => ({ date, value: 5 + (i % 2) }))
}
