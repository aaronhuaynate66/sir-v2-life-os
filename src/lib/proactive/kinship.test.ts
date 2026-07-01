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

  it('IGNORA kinds no-familia (seed batch: colega_hng, contacto_en_comun, etc.)', () => {
    // Fabiola vino de un batch de LinkedIn con este link:
    //   { person_a: 'SELF', person_b: 'Fabiola', kind: 'colega_hng' }
    // El bug antes: se metía al mapa con label='tu familiar' (fallback).
    const map = buildSelfKinshipMap([
      // @ts-expect-error — el tipo restringe a FamilyKind, pero en runtime
      // person_links acepta cualquier string. Simulamos el batch real.
      link({ personBId: 'fabiola', kind: 'colega_hng' }),
      // @ts-expect-error — otro kind del batch
      link({ id: 'l2', personBId: 'cristina', kind: 'contacto_en_comun' }),
      // @ts-expect-error — otro kind del batch
      link({ id: 'l3', personBId: 'x', kind: 'gerente_de_area_de' }),
    ])
    expect(map.size).toBe(0)
    expect(map.get('fabiola')).toBeUndefined()
  })

  it('mezcla: sólo entran los kinds de familia, los otros se ignoran', () => {
    const map = buildSelfKinshipMap([
      link({ personBId: 'mama', kind: 'madre' }), // family ✓
      // @ts-expect-error — no family
      link({ id: 'l2', personBId: 'fabiola', kind: 'colega_hng' }),
      link({ id: 'l3', personBId: 'nn', kind: 'amiga' }), // family ✓
    ])
    expect(map.size).toBe(2)
    expect(map.get('mama')?.label).toBe('tu mamá')
    expect(map.get('nn')?.label).toBe('tu amiga')
    expect(map.get('fabiola')).toBeUndefined()
  })
})
