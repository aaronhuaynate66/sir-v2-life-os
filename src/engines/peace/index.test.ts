// SIR V2 — Tests del Peace Engine (score compuesto central del producto).
//
// LIVE (/panel, useRichContext). calculatePeaceScore pondera 5 componentes
// (.25/.20/.20/.20/.15) con clamps por componente y dispara recoveryMode
// bajo 4. Es EL número central de SIR; un regression silencioso corrompe el
// dashboard entero. Puro salvo el timestamp.

import { describe, it, expect } from 'vitest'

import type { Goal } from '@/types'
import type { PeaceScore } from './index'
import { calculatePeaceScore, evaluateRecoveryMode, detectPeaceThreats } from './index'

function goal(progress: number, status: Goal['status'] = 'active'): Goal {
  return {
    id: `g_${progress}_${status}`,
    title: 't',
    description: '',
    category: 'personal',
    priority: 'medium',
    status,
    progress,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: 5,
    obstacles: [],
    nextAction: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const bio = (o: Partial<{ energyLevel: number; stressLevel: number; lastSleepDuration: number; recoveryScore: number }> = {}) => ({
  energyLevel: 6,
  stressLevel: 5,
  lastSleepDuration: 7,
  recoveryScore: 6,
  ...o,
})
const fin = (stabilityScore: number) => ({
  stabilityScore,
  monthlyBalance: 0,
  liquidityMonths: 0,
  activeAlerts: [],
  timestamp: '2026-01-01T00:00:00.000Z',
})

describe('calculatePeaceScore', () => {
  it('estado sano → score alto, sin recoveryMode', () => {
    const ps = calculatePeaceScore({
      biologicalState: bio({ energyLevel: 8, stressLevel: 3, lastSleepDuration: 8 }),
      financialState: fin(8),
      goals: [goal(80)],
      moodScore: 8,
      relationshipAlertCount: 0,
    })
    expect(ps.components).toEqual({ biological: 8, financial: 8, goalProgress: 8, emotional: 8, relational: 10 })
    expect(ps.total).toBe(8.3) // 2 + 1.6 + 1.6 + 1.6 + 1.5
    expect(ps.recoveryMode).toBe(false)
  })

  it('crisis → recoveryMode activo (total < 4)', () => {
    const ps = calculatePeaceScore({
      biologicalState: bio({ energyLevel: 3, stressLevel: 9, lastSleepDuration: 4 }),
      financialState: fin(2),
      goals: [],
      moodScore: 2,
      relationshipAlertCount: 5,
    })
    expect(ps.components.biological).toBe(3) // 7 -2(sleep<6) -2(stress>7)
    expect(ps.components.goalProgress).toBe(5) // sin goals activos → default 5
    expect(ps.components.relational).toBe(0) // max(0, 10 - 5*2)
    expect(ps.total).toBe(2.6)
    expect(ps.recoveryMode).toBe(true)
  })

  it('clamps por componente: fin/emo topan en 10, relational en 0', () => {
    const ps = calculatePeaceScore({
      biologicalState: bio({ energyLevel: 10, stressLevel: 0, lastSleepDuration: 8 }),
      financialState: fin(15), // → 10
      goals: [goal(40), goal(60)], // avg 50 → round(5)
      moodScore: 12, // → 10
      relationshipAlertCount: 10, // → max(0, -10) = 0
    })
    expect(ps.components.financial).toBe(10)
    expect(ps.components.emotional).toBe(10)
    expect(ps.components.relational).toBe(0)
    expect(ps.components.goalProgress).toBe(5)
    expect(ps.components.biological).toBe(8) // 7 + 1 (energy>7)
  })

  it('goalProgress ignora goals no activos', () => {
    const ps = calculatePeaceScore({
      biologicalState: bio(),
      financialState: fin(5),
      goals: [goal(100, 'completed'), goal(20, 'active')],
      moodScore: 5,
      relationshipAlertCount: 0,
    })
    expect(ps.components.goalProgress).toBe(2) // sólo el activo (20) → round(2)
  })
})

describe('evaluateRecoveryMode', () => {
  function ps(components: PeaceScore['components'], recoveryMode: boolean): PeaceScore {
    return { total: 0, components, trend: 'stable', recoveryMode, lastUpdated: '' }
  }

  it('sin recoveryMode → inactivo', () => {
    const r = evaluateRecoveryMode(ps({ biological: 8, financial: 8, goalProgress: 8, emotional: 8, relational: 8 }, false))
    expect(r.active).toBe(false)
  })

  it('con recoveryMode → razón = el componente más bajo', () => {
    const r = evaluateRecoveryMode(ps({ biological: 1, financial: 8, goalProgress: 8, emotional: 8, relational: 8 }, true))
    expect(r.active).toBe(true)
    expect(r.reason).toBe('Agotamiento biologico')
    expect(r.recommendations).toHaveLength(3)
  })

  it('razón financiera cuando finanzas es el mínimo', () => {
    const r = evaluateRecoveryMode(ps({ biological: 8, financial: 1, goalProgress: 8, emotional: 8, relational: 8 }, true))
    expect(r.reason).toBe('Tension financiera')
  })
})

describe('detectPeaceThreats', () => {
  function ps(components: PeaceScore['components']): PeaceScore {
    return { total: 0, components, trend: 'stable', recoveryMode: false, lastUpdated: '' }
  }
  it('todo sano → sin amenazas', () => {
    expect(detectPeaceThreats(ps({ biological: 8, financial: 8, goalProgress: 8, emotional: 8, relational: 8 }))).toEqual([])
  })
  it('componente < 4 → amenaza correspondiente', () => {
    const t = detectPeaceThreats(ps({ biological: 3, financial: 8, goalProgress: 8, emotional: 8, relational: 8 }))
    expect(t).toHaveLength(1)
    expect(t[0].source).toBe('biological')
  })
})
