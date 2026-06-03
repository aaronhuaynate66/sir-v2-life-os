// SIR V2 — Tests del esfuerzo relacional por parentesco con el "yo".

import { describe, it, expect } from 'vitest'

import type { PersonLink } from '@/types'
import { SELF_ID } from '@/lib/relationships/family'
import { buildSelfKinshipMap } from './kinship'

function link(over: Partial<PersonLink>): PersonLink {
  return {
    id: over.id ?? 'l1',
    personAId: over.personAId ?? SELF_ID,
    personBId: over.personBId ?? 'p1',
    kind: over.kind ?? 'pareja',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('buildSelfKinshipMap', () => {
  it('mapea aristas SELF↔persona a peso + etiqueta posesiva', () => {
    const map = buildSelfKinshipMap([
      link({ personBId: 'diana', kind: 'pareja' }),
      link({ id: 'l2', personBId: 'mama', kind: 'madre' }),
    ])
    expect(map.get('diana')).toMatchObject({ kind: 'pareja', weight: 2.0, label: 'tu pareja' })
    expect(map.get('mama')).toMatchObject({ kind: 'madre', weight: 1.8, label: 'tu mamá' })
  })

  it('pareja pesa más que un hermano', () => {
    const map = buildSelfKinshipMap([
      link({ personBId: 'a', kind: 'pareja' }),
      link({ id: 'l2', personBId: 'b', kind: 'hermano' }),
    ])
    expect(map.get('a')!.weight).toBeGreaterThan(map.get('b')!.weight)
  })

  it('ignora aristas persona↔persona (sin el self)', () => {
    const map = buildSelfKinshipMap([
      link({ personAId: 'otraPersona', personBId: 'p1', kind: 'madre' }),
    ])
    expect(map.size).toBe(0)
  })

  it('persona con varias aristas con el self → gana la de mayor peso', () => {
    const map = buildSelfKinshipMap([
      link({ id: 'l1', personBId: 'x', kind: 'amigo' }), // 1.1
      link({ id: 'l2', personBId: 'x', kind: 'hermano' }), // 1.5
    ])
    expect(map.get('x')!.kind).toBe('hermano')
    expect(map.get('x')!.weight).toBe(1.5)
  })

  it('lista vacía → mapa vacío', () => {
    expect(buildSelfKinshipMap([]).size).toBe(0)
  })
})
