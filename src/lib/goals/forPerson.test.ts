// SIR V2 — Tests del builder de contexto de objetivos (PURO).

import { describe, it, expect } from 'vitest'

import type { Goal } from '@/types'
import { buildGoalContext } from './forPerson'

function goal(over: Partial<Goal>): Goal {
  return {
    id: 'g1',
    title: 'Objetivo',
    description: '',
    category: 'career',
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
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('buildGoalContext', () => {
  it('sin objetivos → null (sin contexto, cero regresión)', () => {
    expect(buildGoalContext([])).toBeNull()
  })

  it('ignora objetivos no activos', () => {
    expect(buildGoalContext([goal({ status: 'completed' }), goal({ status: 'paused' })])).toBeNull()
  })

  it('inyecta título, meta, por qué y detalle del deal', () => {
    const ctx = buildGoalContext([
      goal({
        title: 'Cerrar Boticas Jhodaal como cliente de Marlab',
        category: 'career',
        target: 'Web a comisión firmada (setup + fee + rev-share)',
        why: 'Primer cliente ancla del vertical farmacias',
        description: 'Dayana es la decisora; propuesta de web con pago por comisión.',
        nextAction: 'Enviar propuesta de setup',
      }),
    ])
    expect(ctx).toContain('Cerrar Boticas Jhodaal')
    expect(ctx).toContain('meta: Web a comisión firmada')
    expect(ctx).toContain('por qué importa: Primer cliente ancla')
    expect(ctx).toContain('detalle: Dayana es la decisora')
    expect(ctx).toContain('próxima acción declarada: Enviar propuesta')
  })

  it('tolera campos SMART ausentes (objetivo pre-0042)', () => {
    const ctx = buildGoalContext([goal({ title: 'Ser mejor pareja', target: undefined, why: undefined })])
    expect(ctx).toContain('Ser mejor pareja')
    expect(ctx).not.toContain('meta:')
  })

  it('recorta a 5 objetivos como máximo', () => {
    const many = Array.from({ length: 8 }, (_, i) => goal({ id: `g${i}`, title: `Obj ${i}` }))
    const ctx = buildGoalContext(many) ?? ''
    expect(ctx).toContain('Obj 0')
    expect(ctx).toContain('Obj 4')
    expect(ctx).not.toContain('Obj 5')
  })
})
