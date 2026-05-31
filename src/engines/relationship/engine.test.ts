// SIR V2 — Tests de detectRelationshipAlerts (alertas del /panel).
//
// LIVE: usado en /panel, /relaciones y useRichContext. Decide qué relaciones
// gritan por atención. La aritmética de "días sin contacto" depende de
// Date.now() → usamos fake timers para fijar "ahora" y hacerlo determinista.
//
// Reglas cubiertas: umbral importancia≥8 + días>14 (no_contact), urgencia
// immediate (>30d) vs soon, lastContact ausente → 999 días, status
// 'strained' → conflict immediate, persona sin relación → ignorada, y el
// orden por urgencia (immediate antes que soon).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import type { Person, Relationship } from '@/types'
import { detectRelationshipAlerts } from './engine'

const NOW = new Date('2026-06-01T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

function person(o: Partial<Person> & { id: string }): Person {
  return {
    name: o.id,
    relationship: 'friend',
    category: 'network',
    importanceScore: 5,
    energyImpact: 'neutral',
    trustLevel: 5,
    contactFrequency: '',
    tags: [],
    notes: '',
    ...o,
  } as Person
}

function rel(personId: string, o: Partial<Relationship> = {}): Relationship {
  return {
    id: `r_${personId}`,
    personId,
    type: 'friend',
    status: 'active',
    depth: 5,
    reciprocity: 5,
    history: [],
    sharedGoals: [],
    tensions: [],
    strengths: [],
    ...o,
  }
}

describe('detectRelationshipAlerts', () => {
  it('persona importante (≥8) sin contacto 20d → alerta no_contact "soon"', () => {
    const p = person({ id: 'p1', importanceScore: 9, lastContact: '2026-05-12' }) // 20d
    const alerts = detectRelationshipAlerts([p], [rel('p1')])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].alertType).toBe('no_contact')
    expect(alerts[0].urgency).toBe('soon')
  })

  it('sin contacto 40d → urgencia "immediate"', () => {
    const p = person({ id: 'p1', importanceScore: 10, lastContact: '2026-04-22' }) // 40d
    const alerts = detectRelationshipAlerts([p], [rel('p1')])
    expect(alerts[0].urgency).toBe('immediate')
  })

  it('lastContact ausente → 999 días → alerta immediate', () => {
    const p = person({ id: 'p1', importanceScore: 8 }) // sin lastContact
    const alerts = detectRelationshipAlerts([p], [rel('p1')])
    expect(alerts[0].alertType).toBe('no_contact')
    expect(alerts[0].urgency).toBe('immediate')
  })

  it('importancia < 8 NO dispara no_contact aunque pase mucho tiempo', () => {
    const p = person({ id: 'p1', importanceScore: 7, lastContact: '2026-01-01' })
    expect(detectRelationshipAlerts([p], [rel('p1')])).toHaveLength(0)
  })

  it('contacto reciente (2d) → sin alerta', () => {
    const p = person({ id: 'p1', importanceScore: 10, lastContact: '2026-05-30' })
    expect(detectRelationshipAlerts([p], [rel('p1')])).toHaveLength(0)
  })

  it('relación "strained" → alerta conflict immediate (sin importar contacto)', () => {
    const p = person({ id: 'p1', importanceScore: 3, lastContact: '2026-05-31' })
    const alerts = detectRelationshipAlerts([p], [rel('p1', { status: 'strained' })])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].alertType).toBe('conflict')
    expect(alerts[0].urgency).toBe('immediate')
  })

  it('persona sin relación correspondiente → ignorada', () => {
    const p = person({ id: 'p1', importanceScore: 10 })
    expect(detectRelationshipAlerts([p], [])).toHaveLength(0)
  })

  it('ordena por urgencia: immediate antes que soon', () => {
    const soon = person({ id: 'soon', importanceScore: 9, lastContact: '2026-05-12' }) // 20d soon
    const immediate = person({ id: 'imm', importanceScore: 9, lastContact: '2026-04-22' }) // 40d immediate
    const alerts = detectRelationshipAlerts([soon, immediate], [rel('soon'), rel('imm')])
    expect(alerts[0].urgency).toBe('immediate')
    expect(alerts[alerts.length - 1].urgency).toBe('soon')
  })
})
