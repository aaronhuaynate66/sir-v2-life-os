import { describe, it, expect } from 'vitest'
import { pendingDailyHabits, habitCallbackData, parseHabitCallback } from './checkinButtons'

const H = (id: string, title: string, cadence: string, dates: string[] = []) => ({ id, title, cadence, checkinDates: dates })

describe('pendingDailyHabits', () => {
  const today = '2026-07-19'
  it('devuelve los diarios sin check-in hoy', () => {
    const p = pendingDailyHabits([
      H('a', 'Meditar', 'daily', ['2026-07-18']),        // ayer, hoy no → pendiente
      H('b', 'Leer 20 min', 'daily', ['2026-07-19']),    // hoy ya → no
      H('c', 'Tender la cama', 'daily', []),             // nunca → pendiente
    ], today)
    expect(p.map((x) => x.title)).toEqual(['Meditar', 'Tender la cama'])
  })
  it('excluye los semanales (el evening ya los trata aparte)', () => {
    expect(pendingDailyHabits([H('w', 'Correr largo', 'weekly', [])], today)).toEqual([])
  })
  it('lista vacía si todos marcados hoy', () => {
    expect(pendingDailyHabits([H('a', 'x', 'daily', [today])], today)).toEqual([])
  })
})

describe('habitCallbackData / parseHabitCallback', () => {
  it('ida y vuelta', () => {
    const d = habitCallbackData('hab_1780509282314')
    expect(d).toBe('hb|hab_1780509282314')
    expect(parseHabitCallback(d)).toBe('hab_1780509282314')
  })
  it('no matchea otro callback (sv|)', () => {
    expect(parseHabitCallback('sv|abc|1')).toBeNull()
  })
  it('respeta el límite de 64 bytes', () => {
    expect(habitCallbackData('x'.repeat(100)).length).toBeLessThanOrEqual(64)
  })
})
