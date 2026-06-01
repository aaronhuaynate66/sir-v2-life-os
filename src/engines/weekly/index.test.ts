import { describe, it, expect } from 'vitest'
import type { SelfMetric, SleepRecord, FinancialMovement, Goal } from '@/types'
import { computeWeeklyScore, scoreToTier } from './index'

const NOW = new Date('2026-06-08T12:00:00.000Z') // referencia fija

function metric(daysAgo: number, category: SelfMetric['category'], value: number): SelfMetric {
  return { id: `m_${category}_${daysAgo}_${value}`, category, value, timestamp: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString() }
}
function sleep(daysAgo: number, duration: number, quality: number): SleepRecord {
  const date = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10)
  return { id: `sl_${daysAgo}`, date, bedtime: '23:00', wakeTime: '07:00', duration, quality }
}
function mov(type: FinancialMovement['type'], amountPEN: number): FinancialMovement {
  return { id: `f_${type}_${amountPEN}`, type, amount: amountPEN, currency: 'PEN', exchangeRate: 1, amountPEN, category: 'other', description: '', date: '2026-06-05', recurrent: false, tags: [] }
}
function goal(progress: number, status: Goal['status'] = 'active'): Goal {
  return {
    id: `g_${progress}_${status}`, title: 'x', description: '', category: 'personal', priority: 'medium',
    status, progress, milestones: [], relatedGoals: [], relatedPersons: [], peaceImpact: 5, obstacles: [],
    nextAction: '', createdAt: '2026-01-01', updatedAt: '2026-01-01', targetDate: undefined,
  } as Goal
}

const EMPTY = { selfMetrics: [], sleepRecords: [], financialMovements: [], goals: [] }

describe('scoreToTier', () => {
  it('mapea los umbrales documentados S/A/B/C/D', () => {
    expect(scoreToTier(95)).toBe('S')
    expect(scoreToTier(90)).toBe('S')
    expect(scoreToTier(89.9)).toBe('A')
    expect(scoreToTier(78)).toBe('A')
    expect(scoreToTier(64)).toBe('B')
    expect(scoreToTier(50)).toBe('C')
    expect(scoreToTier(49.9)).toBe('D')
    expect(scoreToTier(0)).toBe('D')
  })
})

describe('computeWeeklyScore', () => {
  it('sin datos → score 0, tier D, no confiable', () => {
    const r = computeWeeklyScore(EMPTY, { now: NOW })
    expect(r.score).toBe(0)
    expect(r.tier).toBe('D')
    expect(r.confident).toBe(false)
    expect(r.daysWithData).toBe(0)
    expect(r.components.every((c) => !c.available)).toBe(true)
  })

  it('semana excelente → tier alto', () => {
    const r = computeWeeklyScore(
      {
        selfMetrics: [metric(1, 'energy', 9), metric(2, 'energy', 8), metric(1, 'stress', 2), metric(3, 'stress', 2)],
        sleepRecords: [sleep(1, 8, 9), sleep(2, 7.5, 8), sleep(3, 8, 9)],
        financialMovements: [mov('income', 5000), mov('expense', 500)],
        goals: [goal(90), goal(85)],
      },
      { now: NOW },
    )
    expect(r.score).toBeGreaterThanOrEqual(78)
    expect(['S', 'A']).toContain(r.tier)
    expect(r.confident).toBe(true)
    expect(r.daysWithData).toBeGreaterThanOrEqual(3)
  })

  it('semana mala (poco sueño, estrés alto, déficit) → tier bajo', () => {
    const r = computeWeeklyScore(
      {
        selfMetrics: [metric(1, 'energy', 2), metric(1, 'stress', 9), metric(2, 'stress', 8)],
        sleepRecords: [sleep(1, 4.5, 3), sleep(2, 5, 4)],
        financialMovements: [mov('income', 100), mov('expense', 5000)],
        goals: [goal(10)],
      },
      { now: NOW },
    )
    expect(r.score).toBeLessThan(50)
    expect(r.tier).toBe('D')
  })

  it('renormaliza pesos sobre lo disponible: solo sueño perfecto → score alto', () => {
    const r = computeWeeklyScore(
      { ...EMPTY, sleepRecords: [sleep(1, 8, 10), sleep(2, 8, 10)] },
      { now: NOW },
    )
    // único componente disponible = sueño (dur 100, calidad 100) → 100.
    const sleepC = r.components.find((c) => c.key === 'sleep')!
    expect(sleepC.available).toBe(true)
    expect(r.components.filter((c) => c.available)).toHaveLength(1)
    expect(r.score).toBe(100)
    expect(r.tier).toBe('S')
  })

  it('excluye datos fuera de la ventana de 7 días', () => {
    const r = computeWeeklyScore(
      { ...EMPTY, selfMetrics: [metric(30, 'energy', 10)] }, // hace 30 días
      { now: NOW },
    )
    const energyC = r.components.find((c) => c.key === 'energy')!
    expect(energyC.available).toBe(false)
    expect(r.daysWithData).toBe(0)
  })

  it('objetivos: ignora los no-activos', () => {
    const r = computeWeeklyScore(
      { ...EMPTY, goals: [goal(100, 'completed'), goal(20, 'active')] },
      { now: NOW },
    )
    const goalsC = r.components.find((c) => c.key === 'goals')!
    expect(goalsC.available).toBe(true)
    expect(goalsC.score).toBe(20) // solo el activo
  })
})
