import { describe, it, expect } from 'vitest'
import type { ObjectiveStep } from '@/types'
import {
  computeGoalAdvance,
  goalAdvanceMap,
  effectiveGoalProgress,
  lastMovementISO,
} from './advance'

const TODAY = '2026-07-26'

let seq = 0
const kr = (o: Partial<ObjectiveStep> & { objectiveId: string }): ObjectiveStep => ({
  id: `kr_${seq++}`, kind: 'key_result', title: 'KR', status: 'pendiente',
  order: 0, createdAt: '2026-06-01T00:00:00Z', ...o,
})
const task = (o: Partial<ObjectiveStep> & { objectiveId: string; parentId: string }): ObjectiveStep => ({
  id: `t_${seq++}`, kind: 'task', title: 'Tarea', status: 'pendiente',
  order: 0, createdAt: '2026-06-01T00:00:00Z', ...o,
})

describe('computeGoalAdvance', () => {
  it('objetivo SIN pasos → percent null (no inventa 0)', () => {
    const a = computeGoalAdvance([], 'g1', TODAY)
    expect(a.percent).toBeNull()
    expect(a.stepCount).toBe(0)
    expect(a.lastAdvanceISO).toBeNull()
  })

  it('rollup OKR: la mitad de las tareas de un KR → 50%', () => {
    const k = kr({ objectiveId: 'g1' })
    const steps = [
      k,
      task({ objectiveId: 'g1', parentId: k.id, status: 'hecho', completedAt: '2026-07-20T10:00:00Z' }),
      task({ objectiveId: 'g1', parentId: k.id }),
    ]
    const a = computeGoalAdvance(steps, 'g1', TODAY)
    expect(a.percent).toBe(50)
    expect(a.lastAdvanceISO).toBe('2026-07-20T10:00:00Z')
    expect(a.stepCount).toBe(3)
  })

  it('pasos SIN ningún KR → rollup plano en vez de null (data vieja no queda invisible)', () => {
    const steps = [
      task({ objectiveId: 'g1', parentId: 'huerfano', status: 'hecho' }),
      task({ objectiveId: 'g1', parentId: 'huerfano' }),
      task({ objectiveId: 'g1', parentId: 'huerfano' }),
      task({ objectiveId: 'g1', parentId: 'huerfano' }),
    ]
    const a = computeGoalAdvance(steps, 'g1', TODAY)
    expect(a.percent).toBe(25)
    expect(a.total).toBe(4)
  })

  it('cuenta los pasos VENCIDOS sin cerrar y NO cuenta los cerrados tarde', () => {
    const k = kr({ objectiveId: 'g1' })
    const steps = [
      k,
      task({ objectiveId: 'g1', parentId: k.id, targetDate: '2026-06-10' }),
      task({ objectiveId: 'g1', parentId: k.id, targetDate: '2026-07-01' }),
      task({ objectiveId: 'g1', parentId: k.id, targetDate: '2026-06-05', status: 'hecho' }),
      task({ objectiveId: 'g1', parentId: k.id, targetDate: '2026-12-01' }),
      task({ objectiveId: 'g1', parentId: k.id }), // sin fecha, nunca vence
    ]
    expect(computeGoalAdvance(steps, 'g1', TODAY).overdue).toBe(2)
  })

  it('un paso que vence HOY todavía no está vencido', () => {
    const k = kr({ objectiveId: 'g1' })
    const steps = [k, task({ objectiveId: 'g1', parentId: k.id, targetDate: TODAY })]
    expect(computeGoalAdvance(steps, 'g1', TODAY).overdue).toBe(0)
  })

  it('ignora los pasos de OTROS objetivos', () => {
    const k1 = kr({ objectiveId: 'g1' })
    const k2 = kr({ objectiveId: 'g2', status: 'hecho' })
    const steps = [k1, k2, task({ objectiveId: 'g1', parentId: k1.id })]
    expect(computeGoalAdvance(steps, 'g1', TODAY).percent).toBe(0)
    expect(computeGoalAdvance(steps, 'g2', TODAY).percent).toBe(100)
  })

  it('lastAdvanceISO toma el cierre MÁS reciente', () => {
    const k = kr({ objectiveId: 'g1' })
    const steps = [
      k,
      task({ objectiveId: 'g1', parentId: k.id, status: 'hecho', completedAt: '2026-07-02T10:00:00Z' }),
      task({ objectiveId: 'g1', parentId: k.id, status: 'hecho', completedAt: '2026-07-19T08:00:00Z' }),
    ]
    expect(computeGoalAdvance(steps, 'g1', TODAY).lastAdvanceISO).toBe('2026-07-19T08:00:00Z')
  })

  it('un paso cerrado SIN completedAt (data pre-0070) no rompe el cálculo', () => {
    const k = kr({ objectiveId: 'g1' })
    const steps = [k, task({ objectiveId: 'g1', parentId: k.id, status: 'hecho' })]
    const a = computeGoalAdvance(steps, 'g1', TODAY)
    expect(a.percent).toBe(100)
    expect(a.lastAdvanceISO).toBeNull()
  })
})

describe('goalAdvanceMap', () => {
  it('devuelve una entrada por objetivo pedido, incluso sin pasos', () => {
    const k = kr({ objectiveId: 'g1', status: 'hecho' })
    const m = goalAdvanceMap([k], ['g1', 'g2'], TODAY)
    expect(m.get('g1')?.percent).toBe(100)
    expect(m.get('g2')?.percent).toBeNull()
  })
})

describe('effectiveGoalProgress', () => {
  it('el rollup real MANDA sobre el escalar manual desactualizado', () => {
    const advance = { goalId: 'g1', percent: 60, done: 3, total: 5, lastAdvanceISO: null, overdue: 0, stepCount: 5 }
    expect(effectiveGoalProgress(advance, 0)).toBe(60)
  })

  it('sin pasos cae al manual (no lo pisa con 0)', () => {
    const advance = { goalId: 'g1', percent: null, done: 0, total: 0, lastAdvanceISO: null, overdue: 0, stepCount: 0 }
    expect(effectiveGoalProgress(advance, 40)).toBe(40)
  })

  it('sin pasos y sin manual → 0', () => {
    expect(effectiveGoalProgress(undefined, null)).toBe(0)
    expect(effectiveGoalProgress(undefined, undefined)).toBe(0)
  })
})

describe('lastMovementISO', () => {
  it('un paso cerrado DESPUÉS de la última edición cuenta como movimiento', () => {
    const advance = { goalId: 'g1', percent: 20, done: 1, total: 5, lastAdvanceISO: '2026-07-24T10:00:00Z', overdue: 0, stepCount: 5 }
    expect(lastMovementISO(advance, '2026-06-01T00:00:00Z')).toBe('2026-07-24T10:00:00Z')
  })

  it('si la edición es más reciente, gana la edición', () => {
    const advance = { goalId: 'g1', percent: 20, done: 1, total: 5, lastAdvanceISO: '2026-07-01T10:00:00Z', overdue: 0, stepCount: 5 }
    expect(lastMovementISO(advance, '2026-07-20T00:00:00Z')).toBe('2026-07-20T00:00:00Z')
  })

  it('sin nada devuelve null', () => {
    expect(lastMovementISO(undefined, null)).toBeNull()
  })
})
