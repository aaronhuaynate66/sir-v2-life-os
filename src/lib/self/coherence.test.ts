import { describe, it, expect } from 'vitest'
import { computeLifeCoherence, coherenceSummaryLine } from './coherence'
import type { Goal, ObjectiveStep } from '@/types'

const NOW = new Date('2026-07-10T12:00:00Z')

function goal(o: Partial<Goal>): Goal {
  return {
    id: 'g',
    title: 'Obj',
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...o,
  } as Goal
}

let seq = 0
function step(o: Partial<ObjectiveStep>): ObjectiveStep {
  seq += 1
  return {
    id: `s${seq}`,
    objectiveId: 'g',
    kind: 'task',
    title: 't',
    status: 'hecho',
    order: 0,
    createdAt: '2026-01-01T00:00:00Z',
    ...o,
  } as ObjectiveStep
}

/** Fecha ISO a `days` días antes de NOW. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

describe('computeLifeCoherence — insufficient', () => {
  it('sin prioridades declaradas → insufficient (nada con qué comparar)', () => {
    const goals = [goal({ id: 'a', priority: 'medium' }), goal({ id: 'b', priority: 'low' })]
    const r = computeLifeCoherence(goals, [step({ objectiveId: 'a', completedAt: daysAgo(5) })], NOW)
    expect(r.state).toBe('insufficient')
    expect(r.declared).toHaveLength(0)
    expect(r.message).toMatch(/No marcaste prioridades/)
    expect(coherenceSummaryLine(r)).toBeNull()
  })

  it('con norte pero poca actividad → insufficient', () => {
    const goals = [goal({ id: 'n', isAnchor: true, priority: 'critical', targetDate: '2026-12-01' })]
    const r = computeLifeCoherence(goals, [step({ objectiveId: 'n', completedAt: daysAgo(10) })], NOW)
    expect(r.state).toBe('insufficient')
    expect(r.message).toMatch(/poca actividad/)
  })

  it('actividad previa pero nada reciente → insufficient (no puedo leer el foco)', () => {
    const goals = [goal({ id: 'n', isAnchor: true, priority: 'critical' })]
    // 5 pasos, todos en la ventana previa (>90d, <180d).
    const steps = Array.from({ length: 5 }, () => step({ objectiveId: 'n', completedAt: daysAgo(120) }))
    const r = computeLifeCoherence(goals, steps, NOW)
    expect(r.state).toBe('insufficient')
    expect(r.recentShare).toBeNull()
    expect(r.message).toMatch(/ninguno en los últimos 90 días/)
  })
})

describe('computeLifeCoherence — declarado', () => {
  it('el ancla cuenta como declarada aunque su prioridad no sea alta', () => {
    const goals = [goal({ id: 'n', isAnchor: true, priority: 'low', targetDate: '2026-12-01' })]
    const steps = Array.from({ length: 4 }, () => step({ objectiveId: 'n', completedAt: daysAgo(10) }))
    const r = computeLifeCoherence(goals, steps, NOW)
    expect(r.declared.map((d) => d.id)).toContain('n')
    expect(r.declared.find((d) => d.id === 'n')?.isAnchor).toBe(true)
    expect(r.anchorTitle).toBeTruthy()
  })

  it('objetivos activos de prioridad alta/crítica entran como declarados', () => {
    const goals = [
      goal({ id: 'h', priority: 'high' }),
      goal({ id: 'c', priority: 'critical' }),
      goal({ id: 'm', priority: 'medium' }),
      goal({ id: 'paused', priority: 'high', status: 'paused' }),
    ]
    const steps = Array.from({ length: 4 }, () => step({ objectiveId: 'h', completedAt: daysAgo(10) }))
    const r = computeLifeCoherence(goals, steps, NOW)
    const ids = r.declared.map((d) => d.id).sort()
    expect(ids).toEqual(['c', 'h'])
  })
})

describe('computeLifeCoherence — veredicto', () => {
  it('coherent: el grueso de la actividad cae en lo declarado', () => {
    const goals = [
      goal({ id: 'n', isAnchor: true, priority: 'critical', targetDate: '2026-12-01' }),
      goal({ id: 'x', priority: 'low' }),
    ]
    const steps = [
      ...Array.from({ length: 5 }, () => step({ objectiveId: 'n', completedAt: daysAgo(10) })),
      step({ objectiveId: 'x', completedAt: daysAgo(12) }),
    ]
    const r = computeLifeCoherence(goals, steps, NOW)
    expect(r.state).toBe('coherent')
    expect(r.recentDeclaredDone).toBe(5)
    expect(r.recentTotalDone).toBe(6)
    expect(r.message).toMatch(/acompaña lo que decís que importa/)
  })

  it('diverging: el grueso de la actividad cae fuera de lo declarado, sin reproche', () => {
    const goals = [
      goal({ id: 'n', isAnchor: true, priority: 'critical', category: 'health', targetDate: '2026-12-01' }),
      goal({ id: 'x', priority: 'low', category: 'financial' }),
    ]
    const steps = [
      step({ objectiveId: 'n', completedAt: daysAgo(10) }),
      ...Array.from({ length: 6 }, () => step({ objectiveId: 'x', completedAt: daysAgo(12) })),
    ]
    const r = computeLifeCoherence(goals, steps, NOW)
    expect(r.state).toBe('diverging')
    expect(r.topActivityArea?.category).toBe('financial')
    expect(r.topActivityAreaDeclared).toBe(false)
    expect(r.message).toMatch(/No es un reproche/)
    expect(r.message).toMatch(/lo financiero/)
  })

  it('mixed: foco repartido', () => {
    const goals = [
      goal({ id: 'n', isAnchor: true, priority: 'critical', targetDate: '2026-12-01' }),
      goal({ id: 'x', priority: 'low' }),
    ]
    const steps = [
      ...Array.from({ length: 2 }, () => step({ objectiveId: 'n', completedAt: daysAgo(10) })),
      ...Array.from({ length: 3 }, () => step({ objectiveId: 'x', completedAt: daysAgo(12) })),
    ]
    const r = computeLifeCoherence(goals, steps, NOW)
    expect(r.state).toBe('mixed')
    expect(r.message).toMatch(/Foco repartido/)
  })
})

describe('computeLifeCoherence — tendencia temporal', () => {
  it('convergiendo: la proporción hacia lo declarado sube vs el período previo', () => {
    const goals = [
      goal({ id: 'n', isAnchor: true, priority: 'critical', targetDate: '2026-12-01' }),
      goal({ id: 'x', priority: 'low' }),
    ]
    const steps = [
      // Reciente: 4/5 declarado (80%).
      ...Array.from({ length: 4 }, () => step({ objectiveId: 'n', completedAt: daysAgo(10) })),
      step({ objectiveId: 'x', completedAt: daysAgo(12) }),
      // Previo: 1/5 declarado (20%).
      step({ objectiveId: 'n', completedAt: daysAgo(120) }),
      ...Array.from({ length: 4 }, () => step({ objectiveId: 'x', completedAt: daysAgo(130) })),
    ]
    const r = computeLifeCoherence(goals, steps, NOW)
    expect(r.trend).toBe('convergiendo')
    expect(r.priorShare).toBeCloseTo(0.2)
    expect(r.recentShare).toBeCloseTo(0.8)
    expect(r.message).toMatch(/viene subiendo/)
  })

  it('alejandose: la proporción cae vs el período previo', () => {
    const goals = [
      goal({ id: 'n', isAnchor: true, priority: 'critical', targetDate: '2026-12-01' }),
      goal({ id: 'x', priority: 'low' }),
    ]
    const steps = [
      // Reciente: 1/5 declarado (20%) → diverging.
      step({ objectiveId: 'n', completedAt: daysAgo(10) }),
      ...Array.from({ length: 4 }, () => step({ objectiveId: 'x', completedAt: daysAgo(12) })),
      // Previo: 4/5 declarado (80%).
      ...Array.from({ length: 4 }, () => step({ objectiveId: 'n', completedAt: daysAgo(120) })),
      step({ objectiveId: 'x', completedAt: daysAgo(130) }),
    ]
    const r = computeLifeCoherence(goals, steps, NOW)
    expect(r.trend).toBe('alejandose')
    expect(r.message).toMatch(/viene bajando/)
  })
})

describe('computeLifeCoherence — prioridades ociosas y huérfanos', () => {
  it('declaredIdle lista las prioridades sin avance reciente', () => {
    const goals = [
      goal({ id: 'n', isAnchor: true, priority: 'critical', title: 'Mundial', targetDate: '2026-12-01' }),
      goal({ id: 'h', priority: 'high', title: 'Mudanza' }),
    ]
    // Solo el norte tiene avances.
    const steps = Array.from({ length: 4 }, () => step({ objectiveId: 'n', completedAt: daysAgo(10) }))
    const r = computeLifeCoherence(goals, steps, NOW)
    expect(r.declaredIdle.map((d) => d.id)).toEqual(['h'])
    expect(r.message).toMatch(/sin ningún avance reciente/)
    expect(r.message).toMatch(/Mudanza/)
  })

  it('pasos de objetivos borrados (huérfanos) se ignoran', () => {
    const goals = [goal({ id: 'n', isAnchor: true, priority: 'critical', targetDate: '2026-12-01' })]
    const steps = [
      ...Array.from({ length: 4 }, () => step({ objectiveId: 'n', completedAt: daysAgo(10) })),
      step({ objectiveId: 'gone', completedAt: daysAgo(10) }), // objetivo inexistente
    ]
    const r = computeLifeCoherence(goals, steps, NOW)
    expect(r.recentTotalDone).toBe(4)
  })

  it('pasos no completados o sin fecha no cuentan; futuro se ignora', () => {
    const goals = [goal({ id: 'n', isAnchor: true, priority: 'critical', targetDate: '2026-12-01' })]
    const steps = [
      ...Array.from({ length: 4 }, () => step({ objectiveId: 'n', completedAt: daysAgo(10) })),
      step({ objectiveId: 'n', status: 'pendiente', completedAt: undefined }),
      step({ objectiveId: 'n', completedAt: undefined }),
      step({ objectiveId: 'n', completedAt: new Date(NOW.getTime() + 5 * 86_400_000).toISOString() }),
    ]
    const r = computeLifeCoherence(goals, steps, NOW)
    expect(r.recentTotalDone).toBe(4)
  })
})

describe('coherenceSummaryLine', () => {
  it('devuelve una línea con números reales cuando hay coherencia legible', () => {
    const goals = [
      goal({ id: 'n', isAnchor: true, priority: 'critical', title: 'Mundial', targetDate: '2026-12-01' }),
      goal({ id: 'x', priority: 'low' }),
    ]
    const steps = [
      ...Array.from({ length: 4 }, () => step({ objectiveId: 'n', completedAt: daysAgo(10) })),
      step({ objectiveId: 'x', completedAt: daysAgo(12) }),
    ]
    const r = computeLifeCoherence(goals, steps, NOW)
    const line = coherenceSummaryLine(r)
    expect(line).toBeTruthy()
    expect(line).toMatch(/Mundial/)
    expect(line).toMatch(/foco declarado/)
  })

  it('determinístico: misma entrada, misma salida', () => {
    const goals = [goal({ id: 'n', isAnchor: true, priority: 'critical', targetDate: '2026-12-01' })]
    const steps = Array.from({ length: 5 }, () => step({ objectiveId: 'n', completedAt: daysAgo(10) }))
    const a = computeLifeCoherence(goals, steps, NOW)
    const b = computeLifeCoherence(goals, steps, NOW)
    expect(a).toEqual(b)
  })
})
