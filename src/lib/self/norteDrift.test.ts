import { describe, it, expect } from 'vitest'
import { computeNorteDrift, relatedActivityISOForAnchor } from './norteDrift'
import type { Goal } from '@/types'

const NOW = new Date('2026-06-15T12:00:00Z')
function goal(over: Partial<Goal>): Goal {
  return {
    id: 'g', title: 'Obj', description: '', category: 'personal', priority: 'high',
    status: 'active', progress: 0, milestones: [], relatedGoals: [], relatedPersons: [],
    peaceImpact: 5, obstacles: [], nextAction: '', createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-06-14T00:00:00Z', ...over,
  } as Goal
}

describe('computeNorteDrift', () => {
  it('sin_norte si no hay ancla', () => {
    expect(computeNorteDrift([goal({ id: 'a' })], NOW).state).toBe('sin_norte')
  })
  it('enfocado: norte tocado hace poco, pocos frentes', () => {
    const r = computeNorteDrift([goal({ id: 'n', isAnchor: true, title: 'Mundial', updatedAt: '2026-06-13T00:00:00Z' })], NOW)
    expect(r.state).toBe('enfocado')
    expect(r.norteTitle).toBe('Mundial')
  })
  it('estancado: norte sin tocar > 45 días', () => {
    const r = computeNorteDrift([goal({ id: 'n', isAnchor: true, updatedAt: '2026-04-01T00:00:00Z' })], NOW)
    expect(r.state).toBe('estancado')
  })
  it('un HITO completado reciente cuenta como avance (no estancado aunque el objetivo no se edite)', () => {
    const r = computeNorteDrift([goal({
      id: 'n', isAnchor: true, updatedAt: '2026-04-01T00:00:00Z',
      milestones: [{ id: 'm', title: 'pasar examen', completed: true, completedAt: '2026-06-13T00:00:00Z' }],
    })], NOW)
    expect(r.state).not.toBe('estancado')
    expect(r.daysSinceTouch).toBeLessThanOrEqual(3)
  })
  it('actividad LIGADA reciente (param del caller) cuenta como avance', () => {
    // Ej: contacto con una persona ligada al objetivo, o un evento agendado.
    const r = computeNorteDrift(
      [goal({ id: 'n', isAnchor: true, updatedAt: '2026-04-01T00:00:00Z' })],
      NOW, '2026-06-14T00:00:00Z',
    )
    expect(r.state).not.toBe('estancado')
    expect(r.daysSinceTouch).toBeLessThanOrEqual(1)
  })
  it('disperso: muchos frentes recientes + norte atrasado', () => {
    const others = ['a', 'b', 'c'].map((id) => goal({ id, updatedAt: '2026-06-12T00:00:00Z' }))
    const anchor = goal({ id: 'n', isAnchor: true, updatedAt: '2026-05-20T00:00:00Z' })
    expect(computeNorteDrift([anchor, ...others], NOW).state).toBe('disperso')
  })
  it('reconoce el norte INFERIDO: prioritario con fecha, sin marcar ⚓ (isAnchor false)', () => {
    // El caso real: Aaron no marca el ancla, pero el Mundial (crítico, con fecha)
    // ES su norte según buildYearCompass. Antes daba "sin_norte" en falso.
    const r = computeNorteDrift([
      goal({ id: 'n', title: 'Mundial', priority: 'critical', targetDate: '2026-11-01', isAnchor: false, updatedAt: '2026-06-13T00:00:00Z' }),
    ], NOW)
    expect(r.state).not.toBe('sin_norte')
    expect(r.norteTitle).toBe('Mundial')
  })
  it('cuenta activeOthers y othersMovedRecently', () => {
    const r = computeNorteDrift([
      goal({ id: 'n', isAnchor: true, updatedAt: '2026-06-14T00:00:00Z' }),
      goal({ id: 'a', updatedAt: '2026-06-13T00:00:00Z' }),
      goal({ id: 'b', updatedAt: '2026-01-01T00:00:00Z' }),
      goal({ id: 'c', status: 'paused' }),
    ], NOW)
    expect(r.activeOthers).toBe(2)
    expect(r.othersMovedRecently).toBe(1)
  })
})

describe('relatedActivityISOForAnchor', () => {
  const anchor = goal({ id: 'n', isAnchor: true, relatedPersons: ['p1', 'p2'], updatedAt: '2026-04-01T00:00:00Z' })
  const people = [
    { id: 'p1', lastContact: '2026-06-10T00:00:00Z' },
    { id: 'p2', lastContact: '2026-06-14T00:00:00Z' },
    { id: 'p3', lastContact: '2026-06-15T00:00:00Z' }, // no ligada al ancla → se ignora
  ]

  it('devuelve el lastContact MÁS reciente entre las personas ligadas al ancla', () => {
    expect(relatedActivityISOForAnchor([anchor], people, NOW)).toBe('2026-06-14T00:00:00Z')
  })
  it('null si el ancla no tiene personas ligadas', () => {
    const solo = goal({ id: 'n', isAnchor: true, relatedPersons: [], updatedAt: '2026-06-01T00:00:00Z' })
    expect(relatedActivityISOForAnchor([solo], people, NOW)).toBeNull()
  })
  it('null si no hay norte', () => {
    expect(relatedActivityISOForAnchor([goal({ id: 'x' })], people, NOW)).toBeNull()
  })
  it('ignora personas sin contacto registrado', () => {
    const gente = [{ id: 'p1', lastContact: null }, { id: 'p2' }]
    expect(relatedActivityISOForAnchor([anchor], gente, NOW)).toBeNull()
  })
  it('des-estanca computeNorteDrift cuando el contacto ligado es reciente', () => {
    // El ancla no se edita hace >45d, pero hubo contacto reciente con su gente.
    const rel = relatedActivityISOForAnchor([anchor], people, NOW)
    const drift = computeNorteDrift([anchor], NOW, rel)
    expect(drift.state).not.toBe('estancado')
  })
})
