import { describe, it, expect } from 'vitest'
import { buildCompanyHub, orgSlug, type HubPerson, type HubGoal } from './companyHub'

const alex: HubPerson = { id: 'alex', name: 'Alex', slug: 'alex', organization: 'Grupo HNG Corporación', importance: 9 }
const fran: HubPerson = { id: 'fran', name: 'Francisco', slug: 'fran', organization: 'K2 Seguridad y Resguardo', importance: 5 }
const ext: HubPerson = { id: 'ext', name: 'Ext', slug: 'ext', organization: 'Acme Inc', importance: 3 }
const people = [alex, fran, ext]
const goals: HubGoal[] = [{ title: 'Mejorar relación con Francisco', personIds: ['fran'] }]

describe('buildCompanyHub — nivel GRUPO', () => {
  it('grupo-hng resuelve a holding con su gente y sub-empresas', () => {
    const hub = buildCompanyHub('grupo-hng', people, goals)
    expect(hub.found).toBe(true)
    expect(hub.level).toBe('grupo')
    expect(hub.label).toBe('Grupo HNG')
    // gente del grupo: alex + fran (no ext)
    expect(hub.people.map((p) => p.id).sort()).toEqual(['alex', 'fran'])
    // ordenada por importancia desc
    expect(hub.people[0].id).toBe('alex')
    // sub-empresas: las organizations distintas (K2, Grupo HNG Corporación)
    expect(hub.subCompanies.length).toBeGreaterThanOrEqual(1)
    expect(hub.subCompanies.some((c) => c.slug === orgSlug('K2 Seguridad y Resguardo'))).toBe(true)
    // objetivo de Francisco aparece
    expect(hub.goals.map((g) => g.title)).toContain('Mejorar relación con Francisco')
  })
})

describe('buildCompanyHub — nivel EMPRESA', () => {
  it('k2 resuelve a empresa con parent Grupo HNG', () => {
    const hub = buildCompanyHub(orgSlug('K2 Seguridad y Resguardo'), people, goals)
    expect(hub.found).toBe(true)
    expect(hub.level).toBe('empresa')
    expect(hub.label).toBe('K2 Seguridad y Resguardo')
    expect(hub.parentGroup?.label).toBe('Grupo HNG')
    expect(hub.parentGroup?.slug).toBe('grupo-hng')
    expect(hub.people.map((p) => p.id)).toEqual(['fran'])
  })
})

describe('buildCompanyHub — no encontrado', () => {
  it('slug desconocido → found false', () => {
    const hub = buildCompanyHub('inexistente-xyz', people, goals)
    expect(hub.found).toBe(false)
  })
})
