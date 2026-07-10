import { describe, it, expect } from 'vitest'
import { buildTrajectoryArc, trajectorySummaryLine, categoryLabelEs } from './trajectoryArc'
import type { Goal, GoalCategory, GoalStatus } from '@/types'

const NOW = new Date('2026-07-10T12:00:00Z')

let seq = 0
function goal(over: Partial<Goal>): Goal {
  seq += 1
  return {
    id: `g${seq}`,
    title: 'Obj',
    description: '',
    category: 'personal',
    priority: 'high',
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
    ...over,
  } as Goal
}

function many(n: number, status: GoalStatus, category: GoalCategory = 'personal', updatedAt = '2026-06-01T00:00:00Z'): Goal[] {
  return Array.from({ length: n }, () => goal({ status, category, updatedAt }))
}

describe('buildTrajectoryArc — conteos y follow-through', () => {
  it('cuenta por estado y calcula follow-through de los resueltos', () => {
    const arc = buildTrajectoryArc(
      [...many(2, 'active'), ...many(3, 'completed'), ...many(1, 'abandoned'), ...many(1, 'paused')],
      NOW,
    )
    expect(arc.total).toBe(7)
    expect(arc.active).toBe(2)
    expect(arc.completed).toBe(3)
    expect(arc.abandoned).toBe(1)
    expect(arc.paused).toBe(1)
    expect(arc.resolved).toBe(4)
    expect(arc.followThrough).toBeCloseTo(3 / 4)
  })

  it('followThrough null cuando no hay resueltos', () => {
    const arc = buildTrajectoryArc(many(3, 'active'), NOW)
    expect(arc.followThrough).toBeNull()
    expect(arc.resolved).toBe(0)
  })

  it('ignora goals sin título', () => {
    const arc = buildTrajectoryArc([goal({ title: '   ' }), goal({ status: 'completed' })], NOW)
    expect(arc.total).toBe(1)
  })
})

describe('buildTrajectoryArc — patrón', () => {
  it('nascent: pocos resueltos y pocos activos', () => {
    const arc = buildTrajectoryArc([...many(1, 'completed'), ...many(1, 'active')], NOW)
    expect(arc.pattern).toBe('nascent')
  })

  it('exploring: muchos frentes abiertos, pocos resueltos', () => {
    const arc = buildTrajectoryArc([...many(5, 'active'), ...many(1, 'completed')], NOW)
    expect(arc.pattern).toBe('exploring')
  })

  it('building: cerrás bastante más de lo que soltás', () => {
    const arc = buildTrajectoryArc([...many(5, 'completed'), ...many(1, 'abandoned')], NOW)
    expect(arc.pattern).toBe('building')
    expect(arc.followThrough).toBeCloseTo(5 / 6)
  })

  it('releasing: soltás más de lo que cerrás', () => {
    const arc = buildTrajectoryArc([...many(1, 'completed'), ...many(4, 'abandoned')], NOW)
    expect(arc.pattern).toBe('releasing')
  })

  it('steady: proporciones parecidas', () => {
    const arc = buildTrajectoryArc([...many(2, 'completed'), ...many(2, 'abandoned')], NOW)
    expect(arc.pattern).toBe('steady')
  })
})

describe('buildTrajectoryArc — momentum reciente vs previo', () => {
  it('acelera: más completados en la ventana reciente', () => {
    const arc = buildTrajectoryArc(
      [
        ...many(3, 'completed', 'career', '2026-06-01T00:00:00Z'), // reciente (<180d)
        ...many(1, 'completed', 'career', '2025-09-01T00:00:00Z'), // previo (180-360d)
      ],
      NOW,
    )
    expect(arc.recentCompleted).toBe(3)
    expect(arc.priorCompleted).toBe(1)
    expect(arc.momentum).toBe('acelera')
  })

  it('desacelera: menos completados recientemente', () => {
    const arc = buildTrajectoryArc(
      [
        ...many(1, 'completed', 'career', '2026-06-01T00:00:00Z'),
        ...many(3, 'completed', 'career', '2025-09-01T00:00:00Z'),
      ],
      NOW,
    )
    expect(arc.momentum).toBe('desacelera')
  })

  it('sin_datos cuando no hay completados fechados en ninguna ventana', () => {
    const arc = buildTrajectoryArc(many(3, 'active'), NOW)
    expect(arc.momentum).toBe('sin_datos')
  })
})

describe('buildTrajectoryArc — áreas fuerte/débil', () => {
  it('identifica el área con mejor y peor follow-through', () => {
    const arc = buildTrajectoryArc(
      [
        ...many(3, 'completed', 'career'), // 100%
        ...many(3, 'abandoned', 'relational'), // 0%
      ],
      NOW,
    )
    expect(arc.strongestArea?.category).toBe('career')
    expect(arc.weakestArea?.category).toBe('relational')
  })

  it('no nombra área débil si solo hay una con resueltos suficientes', () => {
    const arc = buildTrajectoryArc(
      [...many(3, 'completed', 'career'), ...many(1, 'abandoned', 'relational')],
      NOW,
    )
    expect(arc.strongestArea?.category).toBe('career')
    // relational tiene solo 1 resuelto (< MIN_AREA_RESOLVED) → no rankeable
    expect(arc.weakestArea).toBeNull()
  })
})

describe('trajectorySummaryLine', () => {
  it('null cuando no hay objetivos', () => {
    expect(trajectorySummaryLine(buildTrajectoryArc([], NOW))).toBeNull()
  })

  it('resume números reales para la reflexión IA', () => {
    const line = trajectorySummaryLine(
      buildTrajectoryArc([...many(4, 'completed', 'career'), ...many(1, 'abandoned', 'career')], NOW),
    )
    expect(line).toContain('follow-through 80%')
    expect(line).toContain('4 completados')
  })
})

describe('categoryLabelEs', () => {
  it('traduce categorías conocidas', () => {
    expect(categoryLabelEs('financial')).toBe('lo financiero')
    expect(categoryLabelEs('relational')).toBe('los vínculos')
  })
})
