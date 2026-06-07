// SIR V2 — Tests de la lógica pura de pasos de objetivo.

import { describe, it, expect } from 'vitest'

import type { ObjectiveStep } from '@/types'
import {
  sortSteps,
  stepsForObjective,
  keyResultsForObjective,
  tasksForKeyResult,
  computeStepProgress,
  computeKeyResultProgress,
  computeObjectiveProgress,
  nextPendingStep,
  nextPendingLeaf,
  isKeyResult,
  isTask,
  normalizeOrders,
  moveStep,
  daysUntilStep,
  taskStatusToLegacy,
  legacyToTaskStatus,
  effectiveTaskStatus,
  taskStatusPatch,
  blockedByIncomplete,
  isStepBlocked,
  wouldCreateDependencyCycle,
  buildPlanSteps,
} from './steps'
import type { ProposedKeyResult } from './planPrompt'

function step(over: Partial<ObjectiveStep>): ObjectiveStep {
  return {
    id: over.id ?? 's1',
    objectiveId: over.objectiveId ?? 'g1',
    kind: over.kind ?? 'key_result',
    parentId: over.parentId,
    title: over.title ?? 'Paso',
    description: over.description,
    targetDate: over.targetDate,
    status: over.status ?? 'pendiente',
    order: over.order ?? 0,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00Z',
    ...over,
  }
}

/** Atajo: KR de un objetivo. */
function kr(over: Partial<ObjectiveStep>): ObjectiveStep {
  return step({ kind: 'key_result', ...over })
}
/** Atajo: tarea bajo un KR (requiere parentId). */
function task(over: Partial<ObjectiveStep>): ObjectiveStep {
  return step({ kind: 'task', ...over })
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

// ─── OKR: jerarquía KR → tareas (migración 0041) ─────────────────────

describe('isKeyResult / isTask', () => {
  it('kind=key_result o ausente (pre-0041) → KR', () => {
    expect(isKeyResult(kr({}))).toBe(true)
    expect(isTask(kr({}))).toBe(false)
    // data vieja sin kind se castea a key_result por el helper, pero probamos
    // explícitamente el contrato: sólo 'task' es tarea.
  })
  it('kind=task → tarea', () => {
    expect(isTask(task({ parentId: 'k1' }))).toBe(true)
    expect(isKeyResult(task({ parentId: 'k1' }))).toBe(false)
  })
})

describe('keyResultsForObjective', () => {
  it('devuelve sólo KRs del objetivo, ordenados; ignora tareas', () => {
    const steps = [
      kr({ id: 'k2', objectiveId: 'g1', order: 1 }),
      kr({ id: 'k1', objectiveId: 'g1', order: 0 }),
      task({ id: 't1', objectiveId: 'g1', parentId: 'k1', order: 0 }),
      kr({ id: 'kx', objectiveId: 'g2', order: 0 }),
    ]
    expect(keyResultsForObjective(steps, 'g1').map((s) => s.id)).toEqual(['k1', 'k2'])
  })
})

describe('tasksForKeyResult', () => {
  it('devuelve sólo tareas del KR, ordenadas', () => {
    const steps = [
      kr({ id: 'k1' }),
      task({ id: 'tb', parentId: 'k1', order: 1 }),
      task({ id: 'ta', parentId: 'k1', order: 0 }),
      task({ id: 'tx', parentId: 'k2', order: 0 }),
    ]
    expect(tasksForKeyResult(steps, 'k1').map((s) => s.id)).toEqual(['ta', 'tb'])
  })
})

describe('computeKeyResultProgress', () => {
  it('con tareas → rollup hechas/total', () => {
    const k = kr({ id: 'k1' })
    const tasks = [
      task({ id: 'a', parentId: 'k1', status: 'hecho' }),
      task({ id: 'b', parentId: 'k1', status: 'pendiente' }),
    ]
    expect(computeKeyResultProgress(tasks, k)).toEqual({ done: 1, total: 2, percent: 50 })
  })

  it('sin tareas y KR pendiente → 0% (0/1)', () => {
    expect(computeKeyResultProgress([], kr({ status: 'pendiente' }))).toEqual({
      done: 0,
      total: 1,
      percent: 0,
    })
  })

  it('sin tareas y KR hecho → 100% (1/1)', () => {
    expect(computeKeyResultProgress([], kr({ status: 'hecho' }))).toEqual({
      done: 1,
      total: 1,
      percent: 100,
    })
  })
})

describe('computeObjectiveProgress', () => {
  it('sin KRs → null (cae a progreso manual)', () => {
    expect(computeObjectiveProgress([], 'g1')).toBeNull()
  })

  it('promedia los porcentajes de los KRs; done = KRs al 100%', () => {
    const steps = [
      kr({ id: 'k1', objectiveId: 'g1', order: 0 }), // sin tareas, pendiente → 0%
      kr({ id: 'k2', objectiveId: 'g1', order: 1 }), // 1/2 tareas → 50%
      task({ id: 'a', objectiveId: 'g1', parentId: 'k2', status: 'hecho' }),
      task({ id: 'b', objectiveId: 'g1', parentId: 'k2', status: 'pendiente' }),
      kr({ id: 'k3', objectiveId: 'g1', order: 2 }), // todas hechas → 100%
      task({ id: 'c', objectiveId: 'g1', parentId: 'k3', status: 'hecho' }),
    ]
    // promedio (0 + 50 + 100) / 3 = 50; done = 1 (k3)
    expect(computeObjectiveProgress(steps, 'g1')).toEqual({ done: 1, total: 3, percent: 50 })
  })

  it('KR sin tareas pero hecho cuenta como completo', () => {
    const steps = [
      kr({ id: 'k1', objectiveId: 'g1', status: 'hecho' }),
      kr({ id: 'k2', objectiveId: 'g1', status: 'pendiente' }),
    ]
    expect(computeObjectiveProgress(steps, 'g1')).toEqual({ done: 1, total: 2, percent: 50 })
  })
})

describe('nextPendingLeaf', () => {
  it('primera tarea no-hecho del primer KR no-completo', () => {
    const steps = [
      kr({ id: 'k1', order: 0 }),
      task({ id: 'a', parentId: 'k1', order: 0, status: 'hecho' }),
      task({ id: 'b', parentId: 'k1', order: 1, status: 'pendiente', title: 'Comprar pasaje' }),
      kr({ id: 'k2', order: 1 }),
      task({ id: 'c', parentId: 'k2', order: 0, status: 'pendiente' }),
    ]
    const leaf = nextPendingLeaf(steps)
    expect(leaf?.id).toBe('b')
    expect(leaf?.title).toBe('Comprar pasaje')
  })

  it('salta al próximo KR cuando el primero está completo', () => {
    const steps = [
      kr({ id: 'k1', order: 0 }),
      task({ id: 'a', parentId: 'k1', order: 0, status: 'hecho' }),
      kr({ id: 'k2', order: 1 }),
      task({ id: 'b', parentId: 'k2', order: 0, status: 'pendiente', title: 'Pagar fee' }),
    ]
    expect(nextPendingLeaf(steps)?.id).toBe('b')
  })

  it('KR sin tareas y no-hecho → el KR es la hoja', () => {
    const steps = [kr({ id: 'k1', order: 0, status: 'en_progreso', title: 'Visa' })]
    expect(nextPendingLeaf(steps)?.id).toBe('k1')
  })

  it('KR sin tareas y hecho → se salta', () => {
    const steps = [
      kr({ id: 'k1', order: 0, status: 'hecho' }),
      kr({ id: 'k2', order: 1, status: 'pendiente', title: 'Inscripción' }),
    ]
    expect(nextPendingLeaf(steps)?.id).toBe('k2')
  })

  it('todo hecho → null', () => {
    const steps = [
      kr({ id: 'k1', status: 'hecho' }),
      task({ id: 'a', parentId: 'k1', status: 'hecho' }),
    ]
    expect(nextPendingLeaf(steps)).toBeNull()
  })

  it('sin nodos → null', () => {
    expect(nextPendingLeaf([])).toBeNull()
  })
})

// ─── Jira-light: estado de workflow de 4 valores (migración 0050) ────

describe('taskStatusToLegacy / legacyToTaskStatus', () => {
  it('mapea ida y vuelta los estados equivalentes', () => {
    expect(taskStatusToLegacy('done')).toBe('hecho')
    expect(taskStatusToLegacy('in_progress')).toBe('en_progreso')
    expect(taskStatusToLegacy('todo')).toBe('pendiente')
    // 'blocked' no está hecho → pendiente en el legado (el rollup no lo cuenta).
    expect(taskStatusToLegacy('blocked')).toBe('pendiente')

    expect(legacyToTaskStatus('hecho')).toBe('done')
    expect(legacyToTaskStatus('en_progreso')).toBe('in_progress')
    expect(legacyToTaskStatus('pendiente')).toBe('todo')
  })
})

describe('effectiveTaskStatus', () => {
  it('usa taskStatus si está', () => {
    expect(effectiveTaskStatus(task({ taskStatus: 'blocked', status: 'pendiente' }))).toBe('blocked')
  })
  it('deriva del status legado si falta taskStatus (tarea pre-0050)', () => {
    expect(effectiveTaskStatus(task({ status: 'hecho' }))).toBe('done')
    expect(effectiveTaskStatus(task({ status: 'en_progreso' }))).toBe('in_progress')
    expect(effectiveTaskStatus(task({ status: 'pendiente' }))).toBe('todo')
  })
})

describe('taskStatusPatch', () => {
  it('persiste taskStatus y sincroniza el status legado', () => {
    expect(taskStatusPatch('done')).toEqual({ taskStatus: 'done', status: 'hecho' })
    expect(taskStatusPatch('blocked')).toEqual({ taskStatus: 'blocked', status: 'pendiente' })
    expect(taskStatusPatch('in_progress')).toEqual({ taskStatus: 'in_progress', status: 'en_progreso' })
    expect(taskStatusPatch('todo')).toEqual({ taskStatus: 'todo', status: 'pendiente' })
  })

  it('un patch a done sigue contando en el rollup del KR', () => {
    // Garantía clave: cambiar via taskStatus mantiene el rollup andando.
    const k = kr({ id: 'k1' })
    const t = task({ id: 't1', parentId: 'k1', status: 'pendiente' })
    const after = { ...t, ...taskStatusPatch('done') }
    expect(computeKeyResultProgress([after], k)).toEqual({ done: 1, total: 1, percent: 100 })
  })
})

describe('blockedByIncomplete', () => {
  const a = task({ id: 'a', parentId: 'k1', status: 'hecho' })
  const b = task({ id: 'b', parentId: 'k1', status: 'pendiente' })

  it('sin deps → []', () => {
    expect(blockedByIncomplete(task({ id: 't' }), [a, b])).toEqual([])
  })
  it('lista sólo las deps no-hechas; ignora IDs inexistentes', () => {
    const t = task({ id: 't', blockedBy: ['a', 'b', 'zzz'] })
    expect(blockedByIncomplete(t, [a, b]).map((s) => s.id)).toEqual(['b'])
  })
  it('todas las deps hechas → []', () => {
    const t = task({ id: 't', blockedBy: ['a'] })
    expect(blockedByIncomplete(t, [a, b])).toEqual([])
  })
})

describe('isStepBlocked', () => {
  it('estado efectivo blocked → bloqueada', () => {
    expect(isStepBlocked(task({ id: 't', taskStatus: 'blocked' }), [])).toBe(true)
  })
  it('dependencia sin completar → bloqueada', () => {
    const dep = task({ id: 'a', status: 'pendiente' })
    const t = task({ id: 't', blockedBy: ['a'] })
    expect(isStepBlocked(t, [dep, t])).toBe(true)
  })
  it('sin marca ni deps pendientes → no bloqueada', () => {
    const dep = task({ id: 'a', status: 'hecho' })
    const t = task({ id: 't', blockedBy: ['a'], taskStatus: 'todo' })
    expect(isStepBlocked(t, [dep, t])).toBe(false)
  })
})

describe('wouldCreateDependencyCycle', () => {
  it('self-ref es ciclo', () => {
    expect(wouldCreateDependencyCycle([task({ id: 't' })], 't', 't')).toBe(true)
  })
  it('detecta un ciclo indirecto (a→b→t crearía t→a→b→t)', () => {
    const steps = [
      task({ id: 't', blockedBy: ['a'] }), // t depende de a
      task({ id: 'a', blockedBy: ['b'] }), // a depende de b
      task({ id: 'b' }),
    ]
    // agregar dep b→t cerraría el ciclo: b depende de t, y t→a→b.
    expect(wouldCreateDependencyCycle(steps, 'b', 't')).toBe(true)
  })
  it('dep limpia (sin ciclo) → false', () => {
    const steps = [task({ id: 't' }), task({ id: 'a' })]
    expect(wouldCreateDependencyCycle(steps, 't', 'a')).toBe(false)
  })
})

describe('buildPlanSteps', () => {
  const proposed: ProposedKeyResult[] = [
    {
      title: 'Visa y viaje',
      description: 'Documentación lista',
      tasks: [
        {
          title: 'Tramitar la eVisa',
          targetDate: '2026-07-01',
          acceptanceCriteria: 'eVisa aprobada',
          effort: 'M',
          priority: 'high',
        },
        { title: 'Comprar pasaje', effort: 'S', priority: 'high' },
      ],
    },
    { title: 'Inscripción', tasks: [{ title: 'Pagar fee' }] },
  ]
  // makeId determinístico (réplica del de la UI con un stamp fijo).
  const makeId = (i: number, j: number | null) =>
    j === null ? `k_${i}` : `t_${i}_${j}`
  const opts = { proposed, objectiveId: 'g1', createdAt: '2026-06-06T00:00:00Z', makeId }

  it('arma KRs seguidos de sus tareas, con campos Jira-light sólo en tareas', () => {
    const out = buildPlanSteps({ ...opts, baseOrder: 0 })
    // 2 KRs + 3 tareas
    expect(out.filter((s) => s.kind === 'key_result')).toHaveLength(2)
    expect(out.filter((s) => s.kind === 'task')).toHaveLength(3)

    const kr0 = out.find((s) => s.id === 'k_0')!
    expect(kr0).toMatchObject({ kind: 'key_result', order: 0, status: 'pendiente', objectiveId: 'g1' })
    expect(kr0.parentId).toBeUndefined()
    // KR no lleva campos de tarea.
    expect(kr0.acceptanceCriteria).toBeUndefined()
    expect(kr0.effort).toBeUndefined()
    expect(kr0.taskStatus).toBeUndefined()

    const t00 = out.find((s) => s.id === 't_0_0')!
    expect(t00).toMatchObject({
      kind: 'task',
      parentId: 'k_0',
      order: 0,
      targetDate: '2026-07-01',
      acceptanceCriteria: 'eVisa aprobada',
      effort: 'M',
      priority: 'high',
      taskStatus: 'todo',
    })
  })

  it('baseOrder=0 (reemplazar) numera los KRs desde 0', () => {
    const out = buildPlanSteps({ ...opts, baseOrder: 0 })
    const krOrders = out.filter((s) => s.kind === 'key_result').map((s) => s.order)
    expect(krOrders).toEqual([0, 1])
  })

  it('baseOrder=N (agregar) desplaza los KRs detrás de los existentes', () => {
    const out = buildPlanSteps({ ...opts, baseOrder: 4 })
    const krOrders = out.filter((s) => s.kind === 'key_result').map((s) => s.order)
    expect(krOrders).toEqual([4, 5])
    // las tareas conservan su orden local dentro del KR (no se desplazan).
    expect(out.find((s) => s.id === 't_0_1')!.order).toBe(1)
  })

  it('descarta KRs y tareas sin título', () => {
    const noisy: ProposedKeyResult[] = [
      { title: '   ', tasks: [{ title: 'x' }] }, // KR sin título → se ignora con sus tareas
      { title: 'OK', tasks: [{ title: '  ' }, { title: 'Tarea real' }] },
    ]
    const out = buildPlanSteps({ ...opts, proposed: noisy, baseOrder: 0 })
    expect(out.filter((s) => s.kind === 'key_result')).toHaveLength(1)
    expect(out.filter((s) => s.kind === 'task')).toHaveLength(1)
    expect(out.find((s) => s.kind === 'task')!.title).toBe('Tarea real')
  })

  it('plan totalmente vacío → []', () => {
    expect(buildPlanSteps({ ...opts, proposed: [], baseOrder: 0 })).toEqual([])
  })
})
