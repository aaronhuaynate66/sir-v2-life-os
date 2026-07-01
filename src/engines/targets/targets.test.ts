// SIR V2 — Tests del Targets Engine (ingresos + Mundial).

import { describe, it, expect } from 'vitest'
import {
  computeIncomeTargetProgress,
  computeMundialWeightAlert,
  parseWeightCategory,
} from './index'
import type { FinancialMovement, Goal, HealthMetric } from '@/types'

const NOW = new Date(2026, 6, 1) // mié 1 jul 2026

function makeGoal(patch: Partial<Goal>): Goal {
  return {
    id: 'g_test',
    title: 'test',
    description: '',
    category: 'personal',
    priority: 'medium',
    status: 'active',
    progress: 0,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: 5,
    obstacles: [],
    nextAction: '',
    createdAt: '',
    updatedAt: '',
    ...patch,
  }
}

function income(month: number, amountPEN: number, id = `f_${Math.random()}`): FinancialMovement {
  return {
    id,
    type: 'income',
    amount: amountPEN,
    currency: 'PEN',
    exchangeRate: 1,
    amountPEN,
    category: 'other',
    description: 'salario',
    date: `2026-${String(month).padStart(2, '0')}-15`,
    recurrent: false,
    tags: [],
  }
}

describe('computeIncomeTargetProgress', () => {
  it('no_goal cuando no hay objetivo financiero de ingresos', () => {
    const r = computeIncomeTargetProgress([], [], NOW)
    expect(r.status).toBe('no_goal')
  })

  it('detecta el goal financiero y parsea target S/15,000', () => {
    const goals = [
      makeGoal({ id: 'i', title: 'Subir ingresos a S/ 15,000/mes', category: 'financial', target: 'Ingreso mensual de S/ 15,000' }),
    ]
    const movs = [income(4, 6500), income(5, 6200), income(6, 6000)]
    const r = computeIncomeTargetProgress(goals, movs, NOW)
    expect(r.status).toBe('behind')
    expect(r.targetMonthly).toBe(15000)
    expect(r.currentMonthly).toBe(6233)
    expect(r.gapMonthly).toBe(8767)
    expect(r.progressPct).toBe(42)
  })

  it('on_track cuando currentMonthly ≥95% del target', () => {
    const goals = [
      makeGoal({ id: 'i', title: 'Subir ingresos', category: 'financial', target: 'S/10,000' }),
    ]
    const movs = [income(4, 9500), income(5, 9700), income(6, 9800)]
    const r = computeIncomeTargetProgress(goals, movs, NOW)
    expect(r.status).toBe('on_track')
  })

  it('ahead cuando currentMonthly > target', () => {
    const goals = [
      makeGoal({ id: 'i', title: 'Subir ingresos', category: 'financial', target: 'S/5,000' }),
    ]
    const movs = [income(4, 6000), income(5, 7000), income(6, 6500)]
    const r = computeIncomeTargetProgress(goals, movs, NOW)
    expect(r.status).toBe('ahead')
  })

  it('acepta target expresado en formato "15k"', () => {
    const goals = [
      makeGoal({ id: 'i', title: 'Aumentar ingresos', category: 'financial', target: '15k/mes' }),
    ]
    const movs = [income(4, 6000), income(5, 6000), income(6, 6000)]
    const r = computeIncomeTargetProgress(goals, movs, NOW)
    expect(r.targetMonthly).toBe(15000)
  })

  it('no_data cuando no hay ingresos en los últimos 3 meses', () => {
    const goals = [
      makeGoal({ id: 'i', title: 'Subir ingresos', category: 'financial', target: 'S/15,000' }),
    ]
    const r = computeIncomeTargetProgress(goals, [], NOW)
    expect(r.status).toBe('no_data')
  })
})

describe('parseWeightCategory', () => {
  it('parsea "+80 kg" → {80, 87}', () => {
    expect(parseWeightCategory('+80 kg')).toEqual({ min: 80, max: 87 })
  })
  it('parsea "80-87 kg"', () => {
    expect(parseWeightCategory('80-87 kg')).toEqual({ min: 80, max: 87 })
  })
  it('parsea "categoría +80"', () => {
    expect(parseWeightCategory('categoría +80')).toEqual({ min: 80, max: 87 })
  })
  it('null cuando no puede parsear', () => {
    expect(parseWeightCategory('sin peso mencionado')).toBeNull()
    expect(parseWeightCategory(undefined)).toBeNull()
  })
})

function weight(kg: number, dayOffset: number): HealthMetric {
  const d = new Date(2026, 6, 1 - dayOffset)
  return {
    id: `h_${dayOffset}`,
    type: 'weight',
    value: kg,
    unit: 'kg',
    timestamp: d.toISOString(),
  }
}

describe('computeMundialWeightAlert', () => {
  it('no_goal si no hay goal del Mundial', () => {
    const r = computeMundialWeightAlert([], [weight(82, 1)], NOW)
    expect(r.status).toBe('no_goal')
  })

  it('detecta goal por "Mundial" en título + parsea categoría del target', () => {
    const goals = [
      makeGoal({ id: 'm', title: 'GANAR EL MUNDIAL DE BOMBEROS', target: 'Medalla de oro en Taekwondo, categoría +80 kg', targetDate: '2026-11-07' }),
    ]
    const r = computeMundialWeightAlert(goals, [weight(81.8, 0)], NOW)
    expect(r.status).toBe('in_range')
    expect(r.currentKg).toBe(81.8)
    expect(r.categoryMinKg).toBe(80)
    expect(r.categoryMaxKg).toBe(87)
    expect(r.daysToEvent).toBe(129)
  })

  it('below_min si peso <categoría', () => {
    const goals = [
      makeGoal({ id: 'm', title: 'Mundial', target: '+80 kg' }),
    ]
    const r = computeMundialWeightAlert(goals, [weight(79, 0)], NOW)
    expect(r.status).toBe('below_min')
  })

  it('close_to_edge si peso <1kg del borde', () => {
    const goals = [
      makeGoal({ id: 'm', title: 'Mundial', target: '+80 kg' }),
    ]
    const r = computeMundialWeightAlert(goals, [weight(80.5, 0)], NOW)
    expect(r.status).toBe('close_to_edge')
  })

  it('above_max si peso > categoría', () => {
    const goals = [
      makeGoal({ id: 'm', title: 'Mundial', target: '+80 kg' }),
    ]
    const r = computeMundialWeightAlert(goals, [weight(88, 0)], NOW)
    expect(r.status).toBe('above_max')
  })

  it('no_data si no hay lecturas de peso', () => {
    const goals = [
      makeGoal({ id: 'm', title: 'Mundial', target: '+80 kg' }),
    ]
    const r = computeMundialWeightAlert(goals, [], NOW)
    expect(r.status).toBe('no_data')
    expect(r.categoryMinKg).toBe(80)
  })
})
