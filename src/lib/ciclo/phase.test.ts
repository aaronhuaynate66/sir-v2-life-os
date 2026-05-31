// SIR V2 — Tests del ciclo menstrual (util puro determinístico).
//
// cyclePhase() mezcla diferencia de fechas date-only (TZ-local), módulo por
// el largo del ciclo, clasificación por ventana de ovulación (largo−14 ±1) y
// cálculo del próximo período. Casos borde con regression silencioso caro:
// fecha futura, fecha inválida, fronteras de fase, ciclos de distinto largo,
// el wrap del módulo (varios ciclos en el pasado) y el clamp de largo.
//
// `today` se inyecta como Date local explícito → determinista, TZ-estable
// (tanto start como today se reducen a medianoche local).

import { describe, it, expect } from 'vitest'

import { cyclePhase } from './phase'

// Helper: Date local (no UTC) para el día dado.
function localDay(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d)
}

describe('cyclePhase — nulos / guardas', () => {
  it('fecha de inicio inválida → null', () => {
    expect(cyclePhase('no-es-fecha', 28, localDay(2026, 1, 10))).toBeNull()
    expect(cyclePhase('2026-02-30', 28, localDay(2026, 3, 1))).toBeNull() // feb-30 no existe
  })

  it('fecha de inicio en el FUTURO → null (no clasificamos)', () => {
    expect(cyclePhase('2026-02-01', 28, localDay(2026, 1, 1))).toBeNull()
  })
})

describe('cyclePhase — clasificación 28 días', () => {
  const START = '2026-01-01'

  it('día 1 (= inicio): menstrual, próximo período en 28 días', () => {
    const r = cyclePhase(START, 28, localDay(2026, 1, 1))!
    expect(r.cycleDay).toBe(1)
    expect(r.phase).toBe('menstrual')
    expect(r.cycleLength).toBe(28)
    expect(r.daysUntilNextPeriod).toBe(28)
    expect(r.nextPeriodIso).toBe('2026-01-29')
  })

  it('día 5 = menstrual, día 6 = folicular (frontera menstrual)', () => {
    expect(cyclePhase(START, 28, localDay(2026, 1, 5))!.phase).toBe('menstrual')
    expect(cyclePhase(START, 28, localDay(2026, 1, 6))!.phase).toBe('follicular')
  })

  it('ovulación días 13-15 (mid=14, ±1); 12=folicular, 16=lútea', () => {
    expect(cyclePhase(START, 28, localDay(2026, 1, 12))!.phase).toBe('follicular')
    expect(cyclePhase(START, 28, localDay(2026, 1, 13))!.phase).toBe('ovulation')
    expect(cyclePhase(START, 28, localDay(2026, 1, 14))!.phase).toBe('ovulation')
    expect(cyclePhase(START, 28, localDay(2026, 1, 15))!.phase).toBe('ovulation')
    expect(cyclePhase(START, 28, localDay(2026, 1, 16))!.phase).toBe('luteal')
  })

  it('último día (28): lútea, próximo período mañana', () => {
    const r = cyclePhase(START, 28, localDay(2026, 1, 28))!
    expect(r.cycleDay).toBe(28)
    expect(r.phase).toBe('luteal')
    expect(r.daysUntilNextPeriod).toBe(1)
    expect(r.nextPeriodIso).toBe('2026-01-29')
  })
})

describe('cyclePhase — wrap del módulo (ciclos pasados)', () => {
  it('30 días después con ciclo de 28 → día 3 del 2º ciclo (menstrual)', () => {
    // daysSinceStart=30, cycleDay = 30 % 28 + 1 = 3.
    const r = cyclePhase('2026-01-01', 28, localDay(2026, 1, 31))!
    expect(r.cycleDay).toBe(3)
    expect(r.phase).toBe('menstrual')
    expect(r.daysUntilNextPeriod).toBe(26)
    expect(r.nextPeriodIso).toBe('2026-02-26')
  })
})

describe('cyclePhase — largo distinto (35 días)', () => {
  const START = '2026-01-01'
  it('ovulación corre a días 20-22 (mid=21); 19=folicular, 23=lútea', () => {
    expect(cyclePhase(START, 35, localDay(2026, 1, 19))!.phase).toBe('follicular')
    expect(cyclePhase(START, 35, localDay(2026, 1, 20))!.phase).toBe('ovulation')
    expect(cyclePhase(START, 35, localDay(2026, 1, 22))!.phase).toBe('ovulation')
    expect(cyclePhase(START, 35, localDay(2026, 1, 23))!.phase).toBe('luteal')
  })
})

describe('cyclePhase — clamp del largo [15, 60]', () => {
  it('largo < 15 se clampa a 15; > 60 a 60; 0/NaN cae al default 28', () => {
    expect(cyclePhase('2026-01-01', 5, localDay(2026, 1, 1))!.cycleLength).toBe(15)
    expect(cyclePhase('2026-01-01', 100, localDay(2026, 1, 1))!.cycleLength).toBe(60)
    expect(cyclePhase('2026-01-01', 0, localDay(2026, 1, 1))!.cycleLength).toBe(28)
    expect(cyclePhase('2026-01-01', NaN, localDay(2026, 1, 1))!.cycleLength).toBe(28)
  })
})
