// SIR V2 — Tests del Behavioral Suggestion Engine (E3 hueco #4).

import { describe, it, expect } from 'vitest'
import { aggregateBehavioralWindow, detectBehavioralPattern } from './index'
import type { FinancialMovement, SelfMetric, SleepRecord } from '@/types'

const NOW = new Date(2026, 6, 1) // mié 1 jul 2026

function stressLog(dayOffsetBack: number, value: number): SelfMetric {
  const d = new Date(2026, 6, 1 - dayOffsetBack)
  return {
    id: `sm_${dayOffsetBack}`,
    category: 'stress',
    value,
    timestamp: d.toISOString(),
  }
}

function sleepLog(dayOffsetBack: number, duration: number): SleepRecord {
  const d = new Date(2026, 6, 1 - dayOffsetBack)
  return {
    id: `sr_${dayOffsetBack}`,
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    bedtime: '23:00',
    wakeTime: '07:00',
    duration,
    quality: 5,
  }
}

function spend(dayOffsetBack: number, amountPEN: number, intent: FinancialMovement['intent'] = 'no_esencial'): FinancialMovement {
  const d = new Date(2026, 6, 1 - dayOffsetBack)
  return {
    id: `f_${dayOffsetBack}`,
    type: 'expense',
    amount: amountPEN,
    currency: 'PEN',
    exchangeRate: 1,
    amountPEN,
    category: 'personal',
    intent,
    description: 'test',
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    recurrent: false,
    tags: [],
  }
}

describe('aggregateBehavioralWindow', () => {
  it('agrupa stress por día (promedia lecturas múltiples)', () => {
    const w = aggregateBehavioralWindow(
      [stressLog(1, 6), stressLog(1, 8), stressLog(2, 5)],
      [],
      [],
      NOW,
    )
    expect(Object.keys(w.stressByDay).length).toBe(2)
    // Día -1 (30 jun) = promedio(6, 8) = 7
    expect(w.stressByDay['2026-06-30']).toBe(7)
  })

  it('cuenta solo movimientos no_esencial de expense/debt', () => {
    const w = aggregateBehavioralWindow(
      [],
      [],
      [
        spend(1, 100, 'no_esencial'),
        spend(1, 50, 'necesario'), // no cuenta
        spend(2, 200, 'no_esencial'),
        { ...spend(3, 500, 'no_esencial'), type: 'income' }, // no cuenta
      ],
      NOW,
    )
    expect(w.spendByDay['2026-06-30']).toBe(100)
    expect(w.spendByDay['2026-06-29']).toBe(200)
    expect(w.spendByDay['2026-06-28']).toBeUndefined()
  })

  it('respeta la ventana (ignora >windowDays de antigüedad)', () => {
    const w = aggregateBehavioralWindow(
      [stressLog(1, 6), stressLog(30, 9)], // 30 días atrás fuera de ventana
      [],
      [],
      NOW,
      7,
    )
    expect(Object.keys(w.stressByDay)).toEqual(['2026-06-30'])
  })
})

describe('detectBehavioralPattern', () => {
  it('null si <3 días de datos', () => {
    const s = detectBehavioralPattern(
      [stressLog(1, 8), stressLog(2, 7)],
      [],
      [],
      NOW,
    )
    expect(s).toBeNull()
  })

  it('null cuando todo está bien', () => {
    const s = detectBehavioralPattern(
      [stressLog(1, 3), stressLog(2, 4), stressLog(3, 3)],
      [sleepLog(1, 8), sleepLog(2, 7.5), sleepLog(3, 8.2)],
      [],
      NOW,
    )
    expect(s).toBeNull()
  })

  it('patrón A stress_sleep_spend cuando los 3 se alinean', () => {
    // Incluye HOY (offset=0) para que la racha se cuente desde now.
    const metrics = [0, 1, 2, 3, 4].map((d) => stressLog(d, 8))
    const sleeps = [0, 1, 2, 3].map((d) => sleepLog(d, 6.2))
    const spends = [
      spend(0, 150),
      spend(1, 80),
      spend(2, 100),
    ]
    const s = detectBehavioralPattern(metrics, sleeps, spends, NOW)
    expect(s?.kind).toBe('stress_sleep_spend')
    expect(s?.priority).toBe('critical')
    expect(s?.evidence.avgStress).toBe(8)
    expect(s?.evidence.nonEssentialSpend).toBe(330)
  })

  it('patrón B stress_streak (3+ días de estrés alto seguidos)', () => {
    const metrics = [0, 1, 2].map((d) => stressLog(d, 7))
    const sleeps = [0, 1, 2].map((d) => sleepLog(d, 8))
    const s = detectBehavioralPattern(metrics, sleeps, [], NOW)
    expect(s?.kind).toBe('stress_streak')
    expect(s?.priority).toBe('high')
    expect(s?.title).toContain('3 días')
  })

  it('patrón C sleep_debt (2+ días de <6h de sueño)', () => {
    const sleeps = [0, 1, 2].map((d) => sleepLog(d, 5.5))
    const s = detectBehavioralPattern([], sleeps, [], NOW)
    expect(s?.kind).toBe('sleep_debt')
    expect(s?.priority).toBe('medium')
  })

  it('prioridad: patrón A > patrón B > patrón C', () => {
    // Al cumplir A y B y C, gana A.
    const metrics = [0, 1, 2, 3, 4].map((d) => stressLog(d, 8))
    const sleeps = [0, 1, 2].map((d) => sleepLog(d, 5.5))
    const spends = [spend(0, 200), spend(1, 200)]
    const s = detectBehavioralPattern(metrics, sleeps, spends, NOW)
    expect(s?.kind).toBe('stress_sleep_spend')
  })

  it('estrés alto pero racha rota por día actual → no dispara B', () => {
    const metrics = [
      stressLog(0, 3), // hoy bajo — corta la racha desde el inicio
      stressLog(1, 8),
      stressLog(2, 8),
      stressLog(3, 8),
    ]
    const s = detectBehavioralPattern(metrics, [], [], NOW)
    expect(s).toBeNull()
  })

  it('sugerencia es concreta y NO clínica', () => {
    const metrics = [0, 1, 2].map((d) => stressLog(d, 7))
    const s = detectBehavioralPattern(metrics, [], [], NOW)
    // No debería decir "ansiedad", "profesional", "psicólogo".
    const words = (s?.suggestion ?? '').toLowerCase()
    expect(words).not.toMatch(/ansied|profesional|psicólog|clinic|salud mental/)
    // Debería tener acción concreta ("caminar", "llamar", "cerrar").
    expect(words).toMatch(/caminar|llamar|cerrar|cocinar/)
  })
})
