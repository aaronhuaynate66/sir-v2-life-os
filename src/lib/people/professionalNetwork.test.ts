import { describe, it, expect } from 'vitest'
import {
  normalizeOrgKey, orgJoinKey, sharesProfessionalOrg, findColleagues, professionalPairs,
  type NetworkPerson,
} from './professionalNetwork'

describe('normalizeOrgKey / orgJoinKey', () => {
  it('normaliza y prefiere grupo sobre empresa', () => {
    expect(normalizeOrgKey('  Grupo  HNG ')).toBe('grupo hng')
    expect(orgJoinKey({ organization: 'K2', orgGroup: 'Grupo HNG' })).toBe('grupo hng')
    expect(orgJoinKey({ organization: 'K2 Seguridad' })).toBe('k2 seguridad')
    expect(orgJoinKey({})).toBe('')
  })
})

describe('sharesProfessionalOrg', () => {
  it('conecta Alex (grupo HNG) y Francisco (K2, grupo HNG)', () => {
    const alex = { organization: 'Grupo HNG Corporación', orgGroup: 'Grupo HNG' }
    const fran = { organization: 'K2 Seguridad y Resguardo', orgGroup: 'Grupo HNG' }
    expect(sharesProfessionalOrg(alex, fran)).toBe(true)
  })
  it('no conecta sin org declarada', () => {
    expect(sharesProfessionalOrg({}, { orgGroup: 'Grupo HNG' })).toBe(false)
    expect(sharesProfessionalOrg({ orgGroup: 'X' }, { orgGroup: 'Y' })).toBe(false)
  })
})

describe('findColleagues', () => {
  const alex: NetworkPerson = { id: 'a', name: 'Alex', orgGroup: 'Grupo HNG', importance: 9 }
  const fran: NetworkPerson = { id: 'f', name: 'Francisco', organization: 'K2', orgGroup: 'Grupo HNG', importance: 5 }
  const ext: NetworkPerson = { id: 'x', name: 'Externo', orgGroup: 'Otra Corp', importance: 8 }
  const all = [alex, fran, ext]

  it('trae solo colegas del mismo grupo, sin incluirse, con objetivo activo marcado', () => {
    const r = findColleagues(alex, all, { f: 'Cerrar contrato K2' })
    expect(r.map((c) => c.name)).toEqual(['Francisco'])
    expect(r[0].activeGoalTitle).toBe('Cerrar contrato K2')
  })
  it('persona sin org no tiene colegas', () => {
    expect(findColleagues({ id: 'z', name: 'Z' }, all)).toEqual([])
  })
  it('ordena por importancia desc', () => {
    const g2: NetworkPerson = { id: 'g', name: 'Gloria', orgGroup: 'Grupo HNG', importance: 10 }
    const r = findColleagues(alex, [alex, fran, g2])
    expect(r.map((c) => c.name)).toEqual(['Gloria', 'Francisco'])
  })
})

describe('professionalPairs', () => {
  it('genera el par Alex–Francisco una sola vez', () => {
    const all: NetworkPerson[] = [
      { id: 'a', name: 'Alex', orgGroup: 'Grupo HNG' },
      { id: 'f', name: 'Francisco', orgGroup: 'Grupo HNG' },
      { id: 'x', name: 'Ext', orgGroup: 'Otra' },
    ]
    const pairs = professionalPairs(all)
    expect(pairs.length).toBe(1)
    expect([pairs[0].a, pairs[0].b].sort()).toEqual(['a', 'f'])
  })
})

describe('orgJoinKey + registro (resolución automática del grupo)', () => {
  it('conecta por empresa sin grupo explícito vía orgRegistry', () => {
    const alex = { orgGroup: 'Grupo HNG' }
    const fran = { organization: 'K2 Seguridad y Resguardo' } // sin orgGroup
    expect(sharesProfessionalOrg(alex, fran)).toBe(true)
  })
  it('empresa desconocida sin grupo no se cuelga de HNG', () => {
    expect(sharesProfessionalOrg({ organization: 'Acme Inc' }, { orgGroup: 'Grupo HNG' })).toBe(false)
  })
})
