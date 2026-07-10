import { describe, it, expect } from 'vitest'
import { detectGaps } from './detect'
import type { Person, Goal } from '@/types'

function person(p: Partial<Person>): Person {
  // gender por defecto seteado para que el gap de género (nuevo) no dispare en
  // los tests que no son sobre él; los que sí lo prueban pasan gender: undefined.
  return { id: p.id ?? 'p1', name: p.name ?? 'Ana Pérez', relationship: 'friend', category: 'close',
    importanceScore: p.importanceScore ?? 5, energyImpact: 'neutral', trustLevel: 5, contactFrequency: '',
    gender: 'male', tags: [], notes: '', createdAt: '', updatedAt: '', ...p } as Person
}
function goal(g: Partial<Goal>): Goal {
  return { id: g.id ?? 'g1', title: g.title ?? 'Objetivo', description: '', category: 'personal',
    priority: 'medium', status: g.status ?? 'active', progress: 0, milestones: [], relatedGoals: [],
    relatedPersons: [], peaceImpact: 5, obstacles: [], nextAction: g.nextAction ?? '', createdAt: '', updatedAt: '', ...g } as Goal
}

describe('detectGaps', () => {
  it('cumple faltante solo si el vínculo importa (≥6)', () => {
    const gaps = detectGaps([person({ id: 'a', importanceScore: 8 }), person({ id: 'b', importanceScore: 3 })], [])
    expect(gaps.find((g) => g.entityId === 'a' && g.kind === 'birthday')).toBeTruthy()
    expect(gaps.find((g) => g.entityId === 'b')).toBeFalsy()
  })
  it('género faltante en vínculo que importa → gap de máxima prioridad', () => {
    const gaps = detectGaps([person({ id: 'g', gender: undefined, importanceScore: 7 })], [])
    const g = gaps.find((x) => x.entityId === 'g' && x.kind === 'gender')
    expect(g).toBeTruthy()
    expect(g!.field).toBe('gender')
    expect(g!.inputType).toBe('choice')
    expect(gaps[0].kind).toBe('gender') // la llave de lo demás va primero
  })
  it('NO pide género si ya lo tiene', () => {
    const gaps = detectGaps([person({ id: 'g', gender: 'female', importanceScore: 7, birthDate: '1990-01-01', cycleStartDate: '2026-05-01' })], [])
    expect(gaps.find((x) => x.kind === 'gender')).toBeFalsy()
  })
  it('ciclo faltante si es mujer', () => {
    const gaps = detectGaps([person({ id: 'd', name: 'Diana', gender: 'female', importanceScore: 9, birthDate: '1998-06-14' })], [])
    expect(gaps.find((g) => g.kind === 'cycle')).toBeTruthy()
  })
  it('no pide ciclo si ya tiene fecha', () => {
    const gaps = detectGaps([person({ gender: 'female', importanceScore: 9, birthDate: '1998-06-14', cycleStartDate: '2026-05-26' })], [])
    expect(gaps.find((g) => g.kind === 'cycle')).toBeFalsy()
  })
  it('objetivo activo sin próximo paso; el ancla prioriza', () => {
    const gaps = detectGaps([], [goal({ id: 'x', isAnchor: true, nextAction: '' }), goal({ id: 'y', nextAction: 'hacer algo' })])
    expect(gaps.find((g) => g.entityId === 'x' && g.kind === 'goal_next_action')).toBeTruthy()
    expect(gaps.find((g) => g.entityId === 'y')).toBeFalsy()
    expect(gaps[0].entityId).toBe('x') // ancla primero
  })
  it('NO pide cumple si ya hay birth_date (con año)', () => {
    const gaps = detectGaps([person({ id: 'a', importanceScore: 8, birthDate: '1990-06-09' })], [])
    expect(gaps.find((g) => g.entityId === 'a' && g.kind === 'birthday')).toBeFalsy()
  })
  it('NO pide cumple si hay una fecha especial de cumpleaños (año-menos)', () => {
    const gaps = detectGaps([person({
      id: 'a', name: 'Fabiola Masías', importanceScore: 8,
      specialDates: [{ id: 's1', label: 'Cumpleaños de Fabiola', date: '2000-06-09', recurring: true }],
    })], [])
    expect(gaps.find((g) => g.entityId === 'a' && g.kind === 'birthday')).toBeFalsy()
  })
  it('descarta lo dismissed', () => {
    const gaps = detectGaps([person({ id: 'a', importanceScore: 8 })], [], new Set(['birthday:a']))
    expect(gaps).toHaveLength(0)
  })
  it('SÍ pide cumple a un lead, pero con encuadre comercial (posicionar)', () => {
    const gaps = detectGaps([person({ id: 'L', importanceScore: 8, ambito: 'lead' })], [])
    const g = gaps.find((x) => x.entityId === 'L' && x.kind === 'birthday')
    expect(g).toBeTruthy()
    expect(g!.question).toContain('posiciona')
  })
  it('cumple personal NO trae el encuadre comercial y prioriza más', () => {
    const lead = detectGaps([person({ id: 'L', importanceScore: 8, ambito: 'lead' })], [])[0]
    const personal = detectGaps([person({ id: 'P', importanceScore: 8, ambito: 'personal' })], [])[0]
    expect(personal.question).not.toContain('posiciona')
    expect(personal.priority).toBeGreaterThan(lead.priority)
  })
  it('NO pide ciclo a una colega/lead (solo personal)', () => {
    const gaps = detectGaps([person({ id: 'c', gender: 'female', importanceScore: 8, birthDate: '1990-01-01', ambito: 'colega' })], [])
    expect(gaps.find((g) => g.kind === 'cycle')).toBeFalsy()
  })
})
