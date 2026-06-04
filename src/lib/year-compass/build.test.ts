// SIR V2 — Tests de la brújula anual "TU AÑO".
//
// buildYearCompass recibe `now` explícito → determinístico y TZ-independiente
// (toda fecha date-only se parsea con parseLocalDate / componentes locales).
//
// Cubrimos: línea de meses (pasado/actual/futuro), hitos del año (solo
// objetivos activos, forward-looking), puntos por mes, próximos (orden +
// tope 3 + exclusión del ancla), ancla explícita vs fallback, subtítulo
// derivado y casos borde (sin objetivos, sin fecha, fecha vencida).

import { describe, it, expect } from 'vitest'

import type { Goal } from '@/types'
import { buildYearCompass } from './build'

const NOW = new Date(2026, 5, 3) // 3-jun-2026 (junio = índice 5), medianoche local.

function goal(over: Partial<Goal>): Goal {
  return {
    id: over.id ?? 'g1',
    title: over.title ?? 'Objetivo',
    description: over.description ?? '',
    category: over.category ?? 'personal',
    priority: over.priority ?? 'medium',
    status: over.status ?? 'active',
    progress: over.progress ?? 0,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: over.peaceImpact ?? 5,
    obstacles: [],
    nextAction: over.nextAction ?? '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: over.updatedAt ?? '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('buildYearCompass — línea del año', () => {
  it('marca pasado/actual/futuro relativo al mes de hoy', () => {
    const c = buildYearCompass([], NOW)
    expect(c.year).toBe(2026)
    expect(c.currentMonthIndex).toBe(5)
    expect(c.months).toHaveLength(12)
    expect(c.months[0].label).toBe('ENE')
    expect(c.months[11].label).toBe('DIC')
    expect(c.months[4].isPast).toBe(true) // MAY
    expect(c.months[5].isCurrent).toBe(true) // JUN
    expect(c.months[5].isPast).toBe(false)
    expect(c.months[6].isFuture).toBe(true) // JUL
  })

  it('sin objetivos: sin hitos ni ancla', () => {
    const c = buildYearCompass([], NOW)
    expect(c.upcoming).toEqual([])
    expect(c.anchor).toBeNull()
    expect(c.months.every((m) => !m.hasMilestone && !m.isAnchorMonth)).toBe(true)
  })
})

describe('buildYearCompass — hitos y puntos', () => {
  it('solo objetivos activos con fecha en el año y futuros cuentan', () => {
    // 'anchor' fija el ancla para que 'a' quede en upcoming (no absorbido).
    const goals = [
      goal({ id: 'anchor', title: 'Norte', priority: 'critical', targetDate: '2026-12-31' }),
      goal({ id: 'a', title: 'Activo futuro', targetDate: '2026-09-10' }),
      goal({ id: 'b', title: 'Pausado', status: 'paused', targetDate: '2026-09-12' }),
      goal({ id: 'c', title: 'Sin fecha' }),
      goal({ id: 'd', title: 'Vencido', targetDate: '2026-02-01' }),
      goal({ id: 'e', title: 'Otro año', targetDate: '2027-03-01' }),
    ]
    const c = buildYearCompass(goals, NOW)
    expect(c.upcoming.map((m) => m.id)).toEqual(['a'])
    expect(c.months[8].hasMilestone).toBe(true) // SEP
    expect(c.months[1].hasMilestone).toBe(false) // FEB (vencido, no cuenta)
    expect(c.months[2].hasMilestone).toBe(false) // MAR (otro año, no cuenta)
  })

  it('hoy mismo cuenta como hito (daysUntil 0)', () => {
    const goals = [
      goal({ id: 'anchor', priority: 'critical', targetDate: '2026-12-01' }),
      goal({ id: 'a', targetDate: '2026-06-03' }),
    ]
    const c = buildYearCompass(goals, NOW)
    const hoy = c.upcoming.find((m) => m.id === 'a')
    expect(hoy?.daysUntil).toBe(0)
  })
})

describe('buildYearCompass — próximos', () => {
  it('ordena por cercanía y limita a 3, excluyendo el ancla', () => {
    const goals = [
      goal({ id: 'far', title: 'Lejos', targetDate: '2026-12-01' }),
      goal({ id: 'near', title: 'Cerca', targetDate: '2026-07-01' }),
      goal({ id: 'mid', title: 'Medio', targetDate: '2026-09-01' }),
      goal({ id: 'mid2', title: 'Medio2', targetDate: '2026-10-01' }),
      goal({ id: 'anchor', title: 'Ancla', targetDate: '2026-11-01', isAnchor: true }),
    ]
    const c = buildYearCompass(goals, NOW)
    expect(c.anchor?.id).toBe('anchor')
    // 5 hitos, sin el ancla quedan 4, tope 3, ordenados por cercanía.
    expect(c.upcoming.map((m) => m.id)).toEqual(['near', 'mid', 'mid2'])
  })
})

describe('buildYearCompass — ancla', () => {
  it('explícita: gana el objetivo is_anchor aunque no sea el más prioritario', () => {
    const goals = [
      goal({ id: 'crit', title: 'Crítico', priority: 'critical', targetDate: '2026-12-01' }),
      goal({ id: 'low', title: 'Bajo', priority: 'low', targetDate: '2026-08-01', isAnchor: true }),
    ]
    const c = buildYearCompass(goals, NOW)
    expect(c.anchor?.id).toBe('low')
    expect(c.anchor?.monthLabel).toBe('AGO')
    expect(c.anchor?.daysUntil).toBeGreaterThan(0)
    expect(c.months[7].isAnchorMonth).toBe(true) // AGO
  })

  it('fallback: mayor prioridad, luego fecha más lejana', () => {
    const goals = [
      goal({ id: 'hi-near', title: 'Alto cerca', priority: 'high', targetDate: '2026-07-01' }),
      goal({ id: 'hi-far', title: 'Alto lejos', priority: 'high', targetDate: '2026-11-01' }),
      goal({ id: 'mid', title: 'Medio', priority: 'medium', targetDate: '2026-12-01' }),
    ]
    const c = buildYearCompass(goals, NOW)
    expect(c.anchor?.id).toBe('hi-far')
  })

  it('subtítulo: manual > target > descripción', () => {
    const manual = buildYearCompass(
      [goal({ id: 'a', isAnchor: true, anchorSubtitle: 'Al Khobar · TKD', target: 'Oro', description: 'desc', targetDate: '2026-11-01' })],
      NOW,
    )
    expect(manual.anchor?.subtitle).toBe('Al Khobar · TKD')

    const target = buildYearCompass(
      [goal({ id: 'a', isAnchor: true, target: 'Ganar oro', description: 'desc', targetDate: '2026-11-01' })],
      NOW,
    )
    expect(target.anchor?.subtitle).toBe('Ganar oro')

    const desc = buildYearCompass(
      [goal({ id: 'a', isAnchor: true, description: 'Solo descripción', targetDate: '2026-11-01' })],
      NOW,
    )
    expect(desc.anchor?.subtitle).toBe('Solo descripción')
  })

  it('ancla explícita sin fecha: sin mes ni countdown, pero presente', () => {
    const c = buildYearCompass([goal({ id: 'a', title: 'Sin fecha', isAnchor: true })], NOW)
    expect(c.anchor?.id).toBe('a')
    expect(c.anchor?.monthIndex).toBeNull()
    expect(c.anchor?.daysUntil).toBeNull()
    expect(c.months.every((m) => !m.isAnchorMonth)).toBe(true)
  })

  it('el mes del ancla queda marcado como hito y como ancla', () => {
    const c = buildYearCompass([goal({ id: 'a', isAnchor: true, targetDate: '2026-11-15' })], NOW)
    expect(c.months[10].isAnchorMonth).toBe(true) // NOV
    expect(c.months[10].hasMilestone).toBe(true)
  })
})
