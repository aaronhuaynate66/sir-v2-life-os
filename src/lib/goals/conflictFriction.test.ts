import { describe, it, expect } from 'vitest'
import { extractKeywords, matchConflictsToGoal, type RecentConflict } from './conflictFriction'

const conflicts: RecentConflict[] = [
  { personId: 'mama', personName: 'Maria Isabel', value: 2, date: '2026-06-16', note: 'Conversación reciente TENSA — pelea por contarle que iría al Mundial de bomberos; me dijo necio.' },
  { personId: 'jefe', personName: 'Carlos', value: 1, date: '2026-06-10', note: 'Discusión por el presupuesto del proyecto Marlab.' },
]

describe('extractKeywords', () => {
  it('saca tildes, cortos y stopwords', () => {
    const k = extractKeywords('Ir al Mundial de Bomberos con mi mamá')
    expect(k).toContain('mundial')
    expect(k).toContain('bomberos')
    expect(k).not.toContain('con')
    expect(k).not.toContain('al')
  })
})

describe('matchConflictsToGoal', () => {
  it('matchea por solape de palabras-clave (Mundial) aunque la persona no esté vinculada', () => {
    const m = matchConflictsToGoal({ title: 'Ir al Mundial de Bomberos', description: '', relatedPersons: [] }, conflicts)
    expect(m).toHaveLength(1)
    expect(m[0].personId).toBe('mama')
    expect(m[0].sharedKeywords).toEqual(expect.arrayContaining(['mundial', 'bomberos']))
    expect(m[0].byLinkedPerson).toBe(false)
  })

  it('matchea por persona vinculada aunque no haya solape de tema', () => {
    const m = matchConflictsToGoal({ title: 'Comprar una casa', description: '', relatedPersons: ['mama'] }, conflicts)
    expect(m).toHaveLength(1)
    expect(m[0].byLinkedPerson).toBe(true)
    expect(m[0].sharedKeywords).toHaveLength(0)
  })

  it('sin relación ni solape → no matchea', () => {
    const m = matchConflictsToGoal({ title: 'Aprender alemán', description: '', relatedPersons: [] }, conflicts)
    expect(m).toHaveLength(0)
  })

  it('ordena por fecha desc', () => {
    const m = matchConflictsToGoal({ title: 'Marlab y Mundial de bomberos', description: '', relatedPersons: [] }, conflicts)
    expect(m.map((x) => x.personId)).toEqual(['mama', 'jefe'])
  })
})
