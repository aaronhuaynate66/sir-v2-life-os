import { describe, expect, it } from 'vitest'

import { BASE_WEIGHT, edgeKey, nodeKey } from './types'

describe('brain/types · edgeKey', () => {
  it('es deterministica y encoda src/dst/kind', () => {
    expect(edgeKey('person', 'p1', 'person', 'p2', 'family')).toBe(
      'person:p1:person:p2:family',
    )
  })

  it('distingue direccion', () => {
    const a = edgeKey('person', 'p1', 'person', 'p2', 'family')
    const b = edgeKey('person', 'p2', 'person', 'p1', 'family')
    expect(a).not.toBe(b)
  })

  it('distingue por kind', () => {
    const a = edgeKey('goal', 'g1', 'goal', 'g1', 'goal_cost')
    const b = edgeKey('goal', 'g1', 'goal', 'g1', 'goal_step')
    expect(a).not.toBe(b)
  })
})

describe('brain/types · nodeKey', () => {
  it('encoda tipo + id', () => {
    expect(nodeKey('person', 'diana')).toBe('person:diana')
    expect(nodeKey('goal', 'mundial')).toBe('goal:mundial')
  })

  it('distingue mismo id, tipos distintos', () => {
    expect(nodeKey('person', 'x')).not.toBe(nodeKey('goal', 'x'))
  })
})

describe('brain/types · BASE_WEIGHT', () => {
  it('cubre todos los kinds', () => {
    // Si esto rompe es que agregaste un EdgeKind sin peso base.
    const kinds = [
      'family',
      'moment_participant',
      'moment_reference',
      'goal_step',
      'deal_contact',
      'deal_client_org',
      'deal_related',
      'memory_person',
      'observation_person',
      'tracker_goal',
      'tracker_step',
      'money_person',
      'goal_cost',
    ] as const
    for (const k of kinds) {
      expect(BASE_WEIGHT[k]).toBeGreaterThan(0)
    }
  })

  it('family pesa mas que memory (senal fuerte vs debil)', () => {
    expect(BASE_WEIGHT.family).toBeGreaterThan(BASE_WEIGHT.memory_person)
  })
})
