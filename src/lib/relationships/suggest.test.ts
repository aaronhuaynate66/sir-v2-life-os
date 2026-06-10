import { describe, it, expect } from 'vitest'

import {
  inferFamilyLinks,
  inferSelfPivotLinks,
  parseFamilyMentions,
  reconcileFamilyFromNotes,
} from './suggest'
import type { Person, PersonLink } from '@/types'

function person(id: string, name: string, over: Partial<Person> = {}): Person {
  return {
    id,
    slug: id,
    name,
    relationship: 'family',
    category: 'close',
    importanceScore: 5,
    energyImpact: 'neutral',
    trustLevel: 5,
    contactFrequency: '',
    tags: [],
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function link(a: string, b: string, kind: PersonLink['kind']): PersonLink {
  return { id: `${a}-${b}-${kind}`, personAId: a, personBId: b, kind, createdAt: '2026-01-01T00:00:00.000Z' }
}

describe('inferFamilyLinks', () => {
  it('la madre de mi hermana es mi madre (caso del spec)', () => {
    // Nicolle es hermana de Pedro; María es madre de Nicolle.
    const links = [link('pedro', 'nicolle', 'hermana'), link('nicolle', 'maria', 'madre')]
    const s = inferFamilyLinks('pedro', links)
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ source: 'inference', subjectId: 'pedro', targetId: 'maria', kind: 'madre', viaId: 'nicolle' })
  })

  it('no re-sugiere un vínculo que ya existe', () => {
    const links = [
      link('pedro', 'nicolle', 'hermana'),
      link('nicolle', 'maria', 'madre'),
      link('pedro', 'maria', 'madre'), // ya vinculado
    ]
    expect(inferFamilyLinks('pedro', links)).toHaveLength(0)
  })

  it('no compone lo arriesgado', () => {
    // pareja de mi hermana → null (no suegros/políticos en Fase 1)
    const links = [link('pedro', 'nicolle', 'hermana'), link('nicolle', 'leo', 'pareja')]
    expect(inferFamilyLinks('pedro', links)).toHaveLength(0)
  })

  it('no se sugiere a sí mismo', () => {
    const links = [link('a', 'b', 'hermana'), link('b', 'a', 'hermana')]
    const s = inferFamilyLinks('a', links)
    expect(s.every((x) => x.targetId !== 'a')).toBe(true)
  })

  it('SELF forward: Nicolle es mi hermana + María madre de Nicolle ⇒ María es tu madre', () => {
    const links = [link('self', 'nicolle', 'hermana'), link('nicolle', 'maria', 'madre')]
    const s = inferFamilyLinks('self', links)
    expect(s).toContainEqual(
      expect.objectContaining({ subjectId: 'self', targetId: 'maria', kind: 'madre', viaId: 'nicolle' }),
    )
  })

  it('SELF reverse: María es mi madre + Nicolle hija de María ⇒ Nicolle es tu hermana', () => {
    const links = [link('self', 'maria', 'madre'), link('maria', 'nicolle', 'hija')]
    const s = inferFamilyLinks('self', links)
    expect(s).toContainEqual(
      expect.objectContaining({ subjectId: 'self', targetId: 'nicolle', kind: 'hermana', viaId: 'maria' }),
    )
  })
})

describe('inferSelfPivotLinks (pivote en "yo")', () => {
  it('mi padre + mi hermana ⇒ mi hermana es hija de mi padre (ficha del padre)', () => {
    const links = [link('self', 'esteban', 'padre'), link('self', 'nicolle', 'hermana')]
    const s = inferSelfPivotLinks('esteban', links)
    expect(s).toContainEqual(
      expect.objectContaining({ subjectId: 'esteban', targetId: 'nicolle', kind: 'hija', viaId: 'self' }),
    )
  })

  it('reverso: desde la ficha de mi hermana, mi padre es su padre', () => {
    const links = [link('self', 'esteban', 'padre'), link('self', 'nicolle', 'hermana')]
    const s = inferSelfPivotLinks('nicolle', links)
    expect(s).toContainEqual(
      expect.objectContaining({ subjectId: 'nicolle', targetId: 'esteban', kind: 'padre', viaId: 'self' }),
    )
  })

  it('no infiere si el sujeto no cuelga de self', () => {
    const links = [link('self', 'nicolle', 'hermana')]
    expect(inferSelfPivotLinks('esteban', links)).toHaveLength(0)
  })
})

describe('parseFamilyMentions', () => {
  it('extrae "ETIQUETA: nombre" con separadores variados', () => {
    const got = parseFamilyMentions('MADRE: maria, PADRE - Juan; Hermana: Ana')
    expect(got).toEqual([
      { kind: 'madre', rawName: 'maria' },
      { kind: 'padre', rawName: 'Juan' },
      { kind: 'hermana', rawName: 'Ana' },
    ])
  })

  it('mapea sinónimos (mamá, esposa)', () => {
    const got = parseFamilyMentions('Mamá: Rosa\nEsposa: Carla')
    expect(got).toEqual([
      { kind: 'madre', rawName: 'Rosa' },
      { kind: 'pareja', rawName: 'Carla' },
    ])
  })

  it('NO matchea prosa sin separador', () => {
    expect(parseFamilyMentions('su madre vive en Lima y su padre trabaja')).toEqual([])
  })

  it('tolera notas vacías', () => {
    expect(parseFamilyMentions('')).toEqual([])
    expect(parseFamilyMentions(null)).toEqual([])
  })
})

describe('reconcileFamilyFromNotes', () => {
  it('reconcilia "MADRE: maria" contra la persona completa existente', () => {
    const nicolle = person('nicolle', 'Nicolle', { notes: 'MADRE: maria' })
    const people = [nicolle, person('maria', 'María Isabel Espinoza Vidaurre')]
    const s = reconcileFamilyFromNotes(nicolle, people, [])
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ source: 'reconciliation', kind: 'madre', rawName: 'maria' })
    expect(s[0].candidates[0].personId).toBe('maria')
  })

  it('si no hay match, devuelve sugerencia sin candidatos (no pierde el dato)', () => {
    const nicolle = person('nicolle', 'Nicolle', { notes: 'PADRE: juan' })
    const s = reconcileFamilyFromNotes(nicolle, [nicolle], [])
    expect(s).toHaveLength(1)
    expect(s[0].candidates).toEqual([])
  })

  it('excluye al sujeto y a los ya vinculados', () => {
    const nicolle = person('nicolle', 'Nicolle', { notes: 'MADRE: maria' })
    const people = [nicolle, person('maria', 'María Isabel Espinoza Vidaurre')]
    const links = [link('nicolle', 'maria', 'madre')]
    const s = reconcileFamilyFromNotes(nicolle, people, links)
    // El par ya está vinculado → sin candidatos.
    expect(s[0].candidates).toEqual([])
  })
})
