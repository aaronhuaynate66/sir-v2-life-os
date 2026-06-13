import { describe, it, expect } from 'vitest'
import {
  normalizeOrgKey, orgJoinKey, sharesProfessionalOrg, findColleagues, professionalPairs, daysUntilNextBirthday, orgGroupLabel,
  type NetworkPerson,
} from './professionalNetwork'

describe('normalizeOrgKey / orgJoinKey', () => {
  it('normaliza y prefiere grupo sobre empresa', () => {
    expect(normalizeOrgKey('  Grupo  HNG ')).toBe('grupo hng')
    expect(orgJoinKey({ organization: 'K2', orgGroup: 'Grupo HNG' })).toBe('grupo hng')
    // 'K2 Seguridad' ahora resuelve a 'Grupo HNG' vía orgRegistry; para probar
    // el fallback puro a organization usamos una empresa fuera del registro.
    expect(orgJoinKey({ organization: 'Acme Inc' })).toBe('acme inc')
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

describe('daysUntilNextBirthday', () => {
  it('calcula días al próximo cumple (mismo año)', () => {
    const now = new Date(2026, 5, 13) // 13 jun 2026
    expect(daysUntilNextBirthday('1993-06-20', now)).toBe(7)
  })
  it('0 = cumple hoy', () => {
    expect(daysUntilNextBirthday('1990-06-13', new Date(2026, 5, 13))).toBe(0)
  })
  it('rueda al año siguiente si ya pasó', () => {
    const now = new Date(2026, 5, 13)
    const d = daysUntilNextBirthday('1990-06-10', now) // 10 jun ya pasó
    expect(d).toBeGreaterThan(360)
  })
  it('null si no hay fecha válida', () => {
    expect(daysUntilNextBirthday(null, new Date())).toBeNull()
    expect(daysUntilNextBirthday('basura', new Date())).toBeNull()
  })
})

describe('orgGroupLabel', () => {
  it('prefiere org_group; si no, resuelve por registro; si no, la empresa', () => {
    expect(orgGroupLabel({ orgGroup: 'Grupo HNG' })).toBe('Grupo HNG')
    expect(orgGroupLabel({ organization: 'K2 Seguridad y Resguardo' })).toBe('Grupo HNG')
    expect(orgGroupLabel({ organization: 'Acme Inc' })).toBe('Acme Inc')
    expect(orgGroupLabel({})).toBe('')
  })
})
