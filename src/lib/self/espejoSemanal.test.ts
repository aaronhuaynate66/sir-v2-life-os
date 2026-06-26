import { describe, it, expect } from 'vitest'
import type { Goal, ObjectiveStep, SleepRecord, SelfMetric } from '@/types'
import { computeEspejoSemanal } from './espejoSemanal'

const NOW = new Date('2026-06-25T12:00:00.000Z')
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString()
const dayOnly = (daysAgo: number) => iso(daysAgo).slice(0, 10)

function goal(p: Partial<Goal> & { id: string }): Goal {
  return {
    title: 'Objetivo', description: '', category: 'personal', priority: 'medium',
    status: 'active', progress: 0, milestones: [], relatedGoals: [], relatedPersons: [],
    peaceImpact: 5, obstacles: [], nextAction: '', createdAt: iso(120), updatedAt: iso(1),
    ...p,
  } as Goal
}
function step(p: Partial<ObjectiveStep> & { id: string; objectiveId: string }): ObjectiveStep {
  return {
    kind: 'task', title: 'paso', status: 'hecho', order: 0, createdAt: iso(30), completedAt: iso(2),
    ...p,
  } as ObjectiveStep
}
function sleep(daysAgo: number, duration: number): SleepRecord {
  return { id: `sl_${daysAgo}`, date: dayOnly(daysAgo), bedtime: '23:00', wakeTime: '07:00', duration, quality: 5 }
}
function stress(daysAgo: number, value: number): SelfMetric {
  return { id: `st_${daysAgo}_${value}`, category: 'stress', value, timestamp: iso(daysAgo) }
}

describe('computeEspejoSemanal', () => {
  it('sin datos → sin_datos', () => {
    const r = computeEspejoSemanal([], [], [], [], NOW)
    expect(r.state).toBe('sin_datos')
  })

  it('hay objetivos pero sin norte → sin_norte', () => {
    const r = computeEspejoSemanal([goal({ id: 'g1', isAnchor: false })], [], [], [], NOW)
    expect(r.state).toBe('sin_norte')
    expect(r.norteTitle).toBeNull()
  })

  it('norte sin tocar + sin pasos + mal sueño → a la deriva con gaps de alta', () => {
    const anchor = goal({ id: 'n', title: 'Mundial', isAnchor: true, updatedAt: iso(20) })
    const r = computeEspejoSemanal([anchor], [], [sleep(1, 5.5), sleep(2, 5.8)], [], NOW)
    expect(r.state).toBe('a_la_deriva')
    expect(r.norteTitle).toBe('Mundial')
    expect(r.gaps.some((g) => g.key === 'norte' && g.severity === 'alta')).toBe(true)
    expect(r.gaps.some((g) => g.key === 'sueño' && g.severity === 'alta')).toBe(true)
  })

  it('movió pasos pero ninguno en el norte → gap de dispersión', () => {
    const anchor = goal({ id: 'n', title: 'Mundial', isAnchor: true, updatedAt: iso(20) })
    const other = goal({ id: 'o', isAnchor: false })
    const steps = [step({ id: 's1', objectiveId: 'o', completedAt: iso(1) })]
    const r = computeEspejoSemanal([anchor, other], steps, [], [], NOW)
    expect(r.gaps.some((g) => g.key === 'dispersion')).toBe(true)
  })

  it('tocó el norte + cerró pasos + durmió bien → alineado, con wins', () => {
    const anchor = goal({ id: 'n', title: 'Mundial', isAnchor: true, updatedAt: iso(1) })
    const steps = [
      step({ id: 's1', objectiveId: 'n', completedAt: iso(1) }),
      step({ id: 's2', objectiveId: 'n', completedAt: iso(3) }),
    ]
    const sleeps = [sleep(1, 7.5), sleep(2, 7.2), sleep(3, 8)]
    const r = computeEspejoSemanal([anchor], steps, sleeps, [stress(1, 3)], NOW)
    expect(r.state).toBe('alineado')
    expect(r.gaps.length).toBe(0)
    expect(r.wins.length).toBeGreaterThanOrEqual(2)
  })

  it('ignora pasos completados fuera de la ventana de 7 días', () => {
    const anchor = goal({ id: 'n', title: 'Mundial', isAnchor: true, updatedAt: iso(20) })
    const steps = [step({ id: 'old', objectiveId: 'n', completedAt: iso(15) })]
    const r = computeEspejoSemanal([anchor], steps, [], [], NOW)
    // el paso viejo no cuenta → norte sin pasos esta semana
    expect(r.gaps.some((g) => g.key === 'norte')).toBe(true)
  })

  it('estrés alto suma gap', () => {
    const anchor = goal({ id: 'n', title: 'Mundial', isAnchor: true, updatedAt: iso(1) })
    const r = computeEspejoSemanal([anchor], [step({ id: 's', objectiveId: 'n', completedAt: iso(1) })], [], [stress(1, 8.5)], NOW)
    expect(r.gaps.some((g) => g.key === 'estrés')).toBe(true)
  })
})
