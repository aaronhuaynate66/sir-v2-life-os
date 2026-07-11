import { describe, it, expect } from 'vitest'
import { timeGreeting, daySummary } from './greeting'

describe('timeGreeting', () => {
  it('mañana / tarde / noche / madrugada', () => {
    expect(timeGreeting(8).greeting).toBe('Buenos días')
    expect(timeGreeting(15).greeting).toBe('Buenas tardes')
    expect(timeGreeting(21).greeting).toBe('Buenas noches')
    expect(timeGreeting(2).greeting).toBe('Buenas madrugadas')
  })
  it('bordes de franja', () => {
    expect(timeGreeting(5).greeting).toBe('Buenos días')
    expect(timeGreeting(12).greeting).toBe('Buenas tardes')
    expect(timeGreeting(19).greeting).toBe('Buenas noches')
    expect(timeGreeting(0).greeting).toBe('Buenas madrugadas')
    expect(timeGreeting(4).greeting).toBe('Buenas madrugadas')
  })
  it('normaliza horas inválidas sin romper', () => {
    expect(timeGreeting(NaN).greeting).toBe('Buenas tardes') // fallback a 12
    expect(timeGreeting(26).greeting).toBe('Buenas madrugadas') // 26 % 24 = 2 → madrugada
    expect(timeGreeting(-2).greeting).toBe('Buenas noches') // -2 → 22 → noche
  })
  it('cada franja trae su frase', () => {
    expect(timeGreeting(8).phrase.length).toBeGreaterThan(0)
    expect(timeGreeting(2).phrase).toContain('descanso')
  })
})

describe('daySummary', () => {
  it('todo en cero → mensaje calmo', () => {
    expect(daySummary({ care: 0, birthdays: 0, signals: 0, criticalGoals: 0 })).toContain('Todo tranquilo')
  })
  it('una sola pieza', () => {
    expect(daySummary({ care: 1, birthdays: 0, signals: 0, criticalGoals: 0 })).toBe('Hoy: 1 vínculo que cuidar.')
  })
  it('varias piezas con y final, relacional primero', () => {
    const s = daySummary({ care: 2, birthdays: 1, signals: 3, criticalGoals: 1 })
    expect(s).toBe('Hoy: 2 vínculos que cuidar, 1 cumpleaños, 3 señales activas y 1 objetivo crítico.')
  })
  it('plurales correctos', () => {
    expect(daySummary({ care: 0, birthdays: 0, signals: 1, criticalGoals: 2 }))
      .toBe('Hoy: 1 señal activa y 2 objetivos críticos.')
  })
})
