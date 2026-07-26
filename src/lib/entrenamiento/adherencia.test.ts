import { describe, it, expect } from 'vitest'
import { weekStartOf, weeklyAdherence, adherenceLine, type TrainingSession } from './adherencia'

// Bloque BASE del plan del Mundial: 4 sesiones, de las cuales 3 de fuerza.
const BASE = { total: 4, ofKind: { kind: 'fuerza' as const, count: 3 } }
const s = (date: string, kind: TrainingSession['kind'] = 'fuerza'): TrainingSession => ({ date, kind })

describe('weekStartOf', () => {
  it('devuelve el lunes de esa semana', () => {
    expect(weekStartOf('2026-07-29')).toBe('2026-07-27') // miércoles → lunes
    expect(weekStartOf('2026-07-27')).toBe('2026-07-27') // lunes → él mismo
    expect(weekStartOf('2026-08-02')).toBe('2026-07-27') // domingo → lunes previo
  })
  it('tolera basura', () => {
    expect(weekStartOf('nope')).toBe('nope')
  })
})

describe('weeklyAdherence', () => {
  it('cuenta solo lo de esta semana', () => {
    const a = weeklyAdherence([s('2026-07-25'), s('2026-07-28'), s('2026-07-29')], BASE, '2026-07-29')
    expect(a.weekStart).toBe('2026-07-27')
    expect(a.done).toBe(2) // el del 25 es de la semana pasada
  })

  it('separa el tipo que el bloque exige', () => {
    const a = weeklyAdherence([s('2026-07-27', 'fuerza'), s('2026-07-28', 'tecnica')], BASE, '2026-07-29')
    expect(a.done).toBe(2)
    expect(a.doneOfKind).toBe(1)
    expect(a.targetOfKind).toBe(3)
  })

  it('sabe si todavía alcanza', () => {
    // Miércoles con 0 hechas: quedan 5 días, pide 4 → alcanza.
    expect(weeklyAdherence([], BASE, '2026-07-29').reachable).toBe(true)
    // Sábado con 0: quedan 2 días, pide 4 → ya no.
    expect(weeklyAdherence([], BASE, '2026-08-01').reachable).toBe(false)
  })

  it('el domingo queda 1 día (hoy)', () => {
    expect(weeklyAdherence([], BASE, '2026-08-02').daysLeft).toBe(1)
  })
})

describe('adherenceLine', () => {
  it('cumplida: lo reconoce', () => {
    const a = weeklyAdherence(
      [s('2026-07-27'), s('2026-07-28'), s('2026-07-29'), s('2026-07-30', 'tecnica')],
      BASE, '2026-07-31',
    )
    expect(adherenceLine(a)).toContain('Semana cumplida')
  })

  it('a mitad de semana dice cuánto falta, sin regañar', () => {
    const line = adherenceLine(weeklyAdherence([s('2026-07-27')], BASE, '2026-07-29'))!
    expect(line).toContain('1 de 3 de fuerza')
    expect(line).toContain('Quedan')
    expect(line.toLowerCase()).not.toContain('deberías')
  })

  it('cuando ya no da el número, lo dice y reencuadra a la próxima semana', () => {
    const line = adherenceLine(weeklyAdherence([], BASE, '2026-08-01'))!
    expect(line).toContain('ya no sale completa')
    expect(line).toContain('la próxima')
  })

  it('lunes sin nada hecho todavía no es noticia', () => {
    expect(adherenceLine(weeklyAdherence([], BASE, '2026-07-27'))).toBeNull()
  })

  it('sin objetivo de tipo, solo cuenta el total', () => {
    const line = adherenceLine(weeklyAdherence([s('2026-07-28')], { total: 4 }, '2026-07-30'))!
    expect(line).toContain('1 de 4 en total')
    expect(line).not.toContain('fuerza')
  })
})
