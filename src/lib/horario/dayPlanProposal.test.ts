// SIR V2 — Tests del Plan del día (slotting de tareas en huecos por esfuerzo).
//
// Puro y determinístico: las horas salen del reloj Lima (UTC-5 fijo), así que un
// hueco que arranca a las 11:00 Lima se construye en ms con Date.UTC(...,16,...).
// Cubrimos: packing por esfuerzo (S/M/L), varios en un hueco, sin huecos, sin
// tareas, tarea más grande que cualquier hueco, default sin esfuerzo, layout con
// asignaciones editadas (override) y overflow cuando el usuario sobre-asigna.

import { describe, it, expect } from 'vitest'

import type { CockpitTask } from './cockpit'
import type { GapRowItem } from './dayPlan'
import {
  EFFORT_MINUTES,
  DEFAULT_TASK_MINUTES,
  taskMinutes,
  greedyAssign,
  layoutPlan,
  proposeDayPlan,
} from './dayPlanProposal'

// ms del reloj de pared Lima del 2026-06-06. Calculado en minutos (no como hora
// fraccionaria) porque Date.UTC trunca cada componente a entero — así 11.5 = 11:30.
const MIDNIGHT_LIMA = Date.UTC(2026, 5, 6, 5, 0, 0, 0) // 00:00 Lima = 05:00 UTC
const limaMs = (h: number, m = 0) => MIDNIGHT_LIMA + Math.round((h * 60 + m) * 60_000)

function gap(key: string, hStart: number, hEnd: number): GapRowItem {
  const startMs = limaMs(hStart)
  const endMs = limaMs(hEnd)
  return {
    type: 'gap',
    key,
    startMs,
    endMs,
    minutes: Math.round((endMs - startMs) / 60_000),
    status: 'upcoming',
  }
}

function task(id: string, over: Partial<CockpitTask> = {}): CockpitTask {
  return {
    id: `task_${id}`,
    stepId: id,
    title: over.title ?? id,
    objectiveId: 'g1',
    objectiveTitle: 'Objetivo',
    status: 'pendiente',
    daysUntil: 0,
    overdue: false,
    blocked: false,
    href: '/objetivos',
    ...over,
  }
}

describe('taskMinutes — duración por esfuerzo', () => {
  it('mapea S/M/L y cae al default sin esfuerzo', () => {
    expect(taskMinutes(task('a', { effort: 'S' }))).toBe(EFFORT_MINUTES.S)
    expect(taskMinutes(task('b', { effort: 'M' }))).toBe(EFFORT_MINUTES.M)
    expect(taskMinutes(task('c', { effort: 'L' }))).toBe(EFFORT_MINUTES.L)
    expect(taskMinutes(task('d'))).toBe(DEFAULT_TASK_MINUTES)
  })
})

describe('proposeDayPlan — slotting greedy', () => {
  it('ubica una tarea en el primer hueco y le da la hora de inicio', () => {
    const plan = proposeDayPlan([task('t1', { effort: 'M' })], [gap('g1', 11, 13)])
    expect(plan.slots).toHaveLength(1)
    expect(plan.unplaced).toHaveLength(0)
    const s = plan.slots[0]
    expect(s.gapKey).toBe('g1')
    expect(s.startMs).toBe(limaMs(11))
    expect(s.dueTime).toBe('11:00')
    expect(s.minutes).toBe(60)
    expect(s.overflow).toBe(false)
  })

  it('mete varias tareas en un mismo hueco, en secuencia, por esfuerzo', () => {
    // Hueco 11–13 (120m). S(30) + S(30) + M(60) = 120 → entran las tres justo.
    const plan = proposeDayPlan(
      [task('a', { effort: 'S' }), task('b', { effort: 'S' }), task('c', { effort: 'M' })],
      [gap('g1', 11, 13)],
    )
    expect(plan.slots.map((s) => s.dueTime)).toEqual(['11:00', '11:30', '12:00'])
    expect(plan.slots.every((s) => s.gapKey === 'g1')).toBe(true)
    expect(plan.slots.some((s) => s.overflow)).toBe(false)
    expect(plan.unplaced).toHaveLength(0)
  })

  it('reparte en varios huecos cuando uno se llena', () => {
    // Hueco g1 = 11–12 (60m): entra 1 M. g2 = 16–17 (60m): entra la otra M.
    const plan = proposeDayPlan(
      [task('a', { effort: 'M' }), task('b', { effort: 'M' })],
      [gap('g1', 11, 12), gap('g2', 16, 17)],
    )
    const byTask = new Map(plan.slots.map((s) => [s.task.id, s.gapKey]))
    expect(byTask.get('task_a')).toBe('g1')
    expect(byTask.get('task_b')).toBe('g2')
  })

  it('sin huecos → todas sin lugar', () => {
    const plan = proposeDayPlan([task('a'), task('b')], [])
    expect(plan.slots).toHaveLength(0)
    expect(plan.unplaced.map((t) => t.id)).toEqual(['task_a', 'task_b'])
  })

  it('sin tareas → propuesta vacía', () => {
    const plan = proposeDayPlan([], [gap('g1', 11, 13)])
    expect(plan.slots).toHaveLength(0)
    expect(plan.unplaced).toHaveLength(0)
  })

  it('tarea más grande que cualquier hueco → sin lugar', () => {
    // L = 120m, único hueco de 30m.
    const plan = proposeDayPlan([task('big', { effort: 'L' })], [gap('g1', 11, 11.5)])
    expect(plan.slots).toHaveLength(0)
    expect(plan.unplaced.map((t) => t.id)).toEqual(['task_big'])
  })

  it('la que no entra queda sin lugar; la que sí entra se ubica', () => {
    // Hueco 60m: entra la M (60), la L (120) no.
    const plan = proposeDayPlan(
      [task('fits', { effort: 'M' }), task('huge', { effort: 'L' })],
      [gap('g1', 11, 12)],
    )
    expect(plan.slots.map((s) => s.task.id)).toEqual(['task_fits'])
    expect(plan.unplaced.map((t) => t.id)).toEqual(['task_huge'])
  })
})

describe('layoutPlan — asignaciones editadas por el usuario', () => {
  const tasks = [task('a', { effort: 'M' }), task('b', { effort: 'M' })]
  const gaps = [gap('g1', 11, 13), gap('g2', 16, 17)]

  it('respeta el hueco elegido aunque el greedy hubiese elegido otro', () => {
    const plan = layoutPlan(tasks, gaps, { task_a: 'g2', task_b: 'g1' })
    const byTask = new Map(plan.slots.map((s) => [s.task.id, s.gapKey]))
    expect(byTask.get('task_a')).toBe('g2')
    expect(byTask.get('task_b')).toBe('g1')
  })

  it('asignación null → sin programar', () => {
    const plan = layoutPlan(tasks, gaps, { task_a: 'g1', task_b: null })
    expect(plan.slots.map((s) => s.task.id)).toEqual(['task_a'])
    expect(plan.unplaced.map((t) => t.id)).toEqual(['task_b'])
  })

  it('overflow: si el usuario amontona más de lo que entra, se marca pero no se bloquea', () => {
    // Hueco 11–12 (60m) con dos M (60 c/u): la segunda empieza 12:00 y termina 13:00 > fin.
    const plan = layoutPlan(tasks, [gap('g1', 11, 12)], { task_a: 'g1', task_b: 'g1' })
    expect(plan.slots).toHaveLength(2)
    expect(plan.slots[0].overflow).toBe(false)
    expect(plan.slots[1].overflow).toBe(true)
    expect(plan.slots[1].dueTime).toBe('12:00')
  })

  it('asignación a un hueco inexistente → sin lugar (defensivo)', () => {
    const plan = layoutPlan(tasks, gaps, { task_a: 'fantasma', task_b: 'g1' })
    expect(plan.unplaced.map((t) => t.id)).toEqual(['task_a'])
    expect(plan.slots.map((s) => s.task.id)).toEqual(['task_b'])
  })
})

describe('greedyAssign — decisión de hueco', () => {
  it('descuenta capacidad usada al asignar', () => {
    // g1 = 90m: entra S(30)+M(60)=90; la tercera S(30) va a g2.
    const a = greedyAssign(
      [task('a', { effort: 'S' }), task('b', { effort: 'M' }), task('c', { effort: 'S' })],
      [gap('g1', 11, 12.5), gap('g2', 16, 17)],
    )
    expect(a).toEqual({ task_a: 'g1', task_b: 'g1', task_c: 'g2' })
  })
})
