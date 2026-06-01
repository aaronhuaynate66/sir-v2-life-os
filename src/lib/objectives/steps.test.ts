// SIR V2 — Tests de la lógica pura de pasos de objetivo.

import { describe, it, expect } from 'vitest'

import type { ObjectiveStep } from '@/types'
import {
  sortSteps,
  stepsForObjective,
  computeStepProgress,
  nextPendingStep,
  normalizeOrders,
  moveStep,
  daysUntilStep,
} from './steps'

function step(over: Partial<ObjectiveStep>): ObjectiveStep {
  return {
    id: over.id ?? 's1',
    objectiveId: over.objectiveId ?? 'g1',
    title: over.title ?? 'Paso',
    description: over.description,
    targetDate: over.targetDate,
    status: over.status ?? 'pendiente',
    order: over.order ?? 0,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('sortSteps', () => {
  it('ordena por order asc, desempata por createdAt y luego id', () => {
    const a = step({ id: 'a', order: 1 })
    const b = step({ id: 'b', order: 0 })
    const c1 = step({ id: 'c1', order: 2, createdAt: '2026-02-01T00:00:00Z' })
    const c2 = step({ id: 'c2', order: 2, createdAt: '2026-01-15T00:00:00Z' })
    expect(sortSteps([a, c1, c2, b]).map((s) => s.id)).toEqual(['b', 'a', 'c2', 'c1'])
  })

  it('no muta el input', () => {
    const arr = [step({ id: 'a', order: 1 }), step({ id: 'b', order: 0 })]
    const snapshot = arr.map((s) => s.id)
    sortSteps(arr)
    expect(arr.map((s) => s.id)).toEqual(snapshot)
  })
})

describe('stepsForObjective', () => {
  it('filtra por objetivo y ordena', () => {
    const steps = [
      step({ id: 'x', objectiveId: 'g2', order: 0 }),
      step({ id: 'a', objectiveId: 'g1', order: 1 }),
      step({ id: 'b', objectiveId: 'g1', order: 0 }),
    ]
    expect(stepsForObjective(steps, 'g1').map((s) => s.id)).toEqual(['b', 'a'])
  })
})

describe('computeStepProgress', () => {
  it('sin pasos → null (cae a progreso manual)', () => {
    expect(computeStepProgress([])).toBeNull()
  })

  it('rollup hechos/total redondeado', () => {
    const steps = [
      step({ id: '1', status: 'hecho' }),
      step({ id: '2', status: 'hecho' }),
      step({ id: '3', status: 'en_progreso' }),
    ]
    expect(computeStepProgress(steps)).toEqual({ done: 2, total: 3, percent: 67 })
  })

  it('todos hechos → 100%', () => {
    const steps = [step({ id: '1', status: 'hecho' }), step({ id: '2', status: 'hecho' })]
    expect(computeStepProgress(steps)).toEqual({ done: 2, total: 2, percent: 100 })
  })

  it('ninguno hecho → 0%', () => {
    expect(computeStepProgress([step({ id: '1' })])).toEqual({ done: 0, total: 1, percent: 0 })
  })
})

describe('nextPendingStep', () => {
  it('primer paso no-hecho por orden', () => {
    const steps = [
      step({ id: 'a', order: 0, status: 'hecho' }),
      step({ id: 'b', order: 1, status: 'en_progreso' }),
      step({ id: 'c', order: 2, status: 'pendiente' }),
    ]
    expect(nextPendingStep(steps)?.id).toBe('b')
  })

  it('todo hecho → null', () => {
    const steps = [step({ id: 'a', status: 'hecho' })]
    expect(nextPendingStep(steps)).toBeNull()
  })

  it('sin pasos → null', () => {
    expect(nextPendingStep([])).toBeNull()
  })
})

describe('normalizeOrders', () => {
  it('reasigna densamente y devuelve solo los que cambiaron', () => {
    const steps = [
      step({ id: 'a', order: 5 }),
      step({ id: 'b', order: 10 }),
      step({ id: 'c', order: 2 }),
    ]
    // orden actual por `order`: c(2), a(5), b(10) → densos 0,1,2
    const changed = normalizeOrders(steps)
    const byId = Object.fromEntries(changed.map((s) => [s.id, s.order]))
    expect(byId).toEqual({ c: 0, a: 1, b: 2 })
  })

  it('ya denso → no cambia nada', () => {
    const steps = [step({ id: 'a', order: 0 }), step({ id: 'b', order: 1 })]
    expect(normalizeOrders(steps)).toEqual([])
  })
})

describe('moveStep', () => {
  const base = [
    step({ id: 'a', order: 0 }),
    step({ id: 'b', order: 1 }),
    step({ id: 'c', order: 2 }),
  ]

  it('mueve arriba: intercambia order con el vecino previo', () => {
    const changed = moveStep(base, 'b', 'up')
    const byId = Object.fromEntries(changed.map((s) => [s.id, s.order]))
    expect(byId).toEqual({ b: 0, a: 1 })
  })

  it('mueve abajo: intercambia order con el vecino siguiente', () => {
    const changed = moveStep(base, 'b', 'down')
    const byId = Object.fromEntries(changed.map((s) => [s.id, s.order]))
    expect(byId).toEqual({ b: 2, c: 1 })
  })

  it('extremos no se mueven', () => {
    expect(moveStep(base, 'a', 'up')).toEqual([])
    expect(moveStep(base, 'c', 'down')).toEqual([])
  })

  it('id inexistente → []', () => {
    expect(moveStep(base, 'zzz', 'up')).toEqual([])
  })

  it('orders iguales (data vieja) → desambigua con índices densos', () => {
    const dup = [
      step({ id: 'a', order: 0, createdAt: '2026-01-01T00:00:00Z' }),
      step({ id: 'b', order: 0, createdAt: '2026-01-02T00:00:00Z' }),
    ]
    // ordenados: a, b → mover b arriba debe darle order 0 y a order 1
    const changed = moveStep(dup, 'b', 'up')
    const byId = Object.fromEntries(changed.map((s) => [s.id, s.order]))
    expect(byId).toEqual({ b: 0, a: 1 })
  })
})

describe('daysUntilStep', () => {
  const NOW = new Date(2026, 5, 1) // 1-jun-2026 local

  it('fecha futura → positivo', () => {
    expect(daysUntilStep(step({ targetDate: '2026-06-06' }), NOW)).toBe(5)
  })

  it('fecha pasada → negativo', () => {
    expect(daysUntilStep(step({ targetDate: '2026-05-20' }), NOW)).toBe(-12)
  })

  it('hoy → 0', () => {
    expect(daysUntilStep(step({ targetDate: '2026-06-01' }), NOW)).toBe(0)
  })

  it('sin fecha → null', () => {
    expect(daysUntilStep(step({}), NOW)).toBeNull()
  })
})
