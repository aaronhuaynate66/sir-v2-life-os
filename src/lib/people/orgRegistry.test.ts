import { describe, it, expect } from 'vitest'
import { resolveOrgGroup, normalizeOrgName } from './orgRegistry'

describe('resolveOrgGroup', () => {
  it('resuelve filiales de Grupo HNG', () => {
    expect(resolveOrgGroup('K2 Seguridad y Resguardo')).toBe('Grupo HNG')
    expect(resolveOrgGroup('Facilita S.A.C.')).toBe('Grupo HNG')
    expect(resolveOrgGroup('Grupo HNG Corporación S.A.C.')).toBe('Grupo HNG')
    expect(resolveOrgGroup('Concrefab')).toBe('Grupo HNG')
  })
  it('no inventa grupo para empresas desconocidas', () => {
    expect(resolveOrgGroup('Banco de Crédito del Perú')).toBeUndefined()
    expect(resolveOrgGroup('')).toBeUndefined()
    expect(resolveOrgGroup(null)).toBeUndefined()
  })
  it('normaliza', () => {
    expect(normalizeOrgName('  Grupo   HNG ')).toBe('grupo hng')
  })
})
