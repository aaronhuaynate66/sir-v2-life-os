import { describe, it, expect } from 'vitest'
import { orgSlugFromName } from './orgSlug'

describe('orgSlugFromName', () => {
  it('normaliza nombres reales de las unidades de Aaron', () => {
    expect(orgSlugFromName('RIT (CGBVP)')).toBe('rit-cgbvp')
    expect(orgSlugFromName('CGBVP')).toBe('cgbvp')
    expect(orgSlugFromName('Sienna Minerals S.A.C.')).toBe('sienna-minerals-s-a-c')
    expect(orgSlugFromName('USAR Perú')).toBe('usar-peru')
  })

  it('es estable: el mismo nombre da el mismo slug aunque cambie el formato', () => {
    expect(orgSlugFromName('  Grupo   HNG  ')).toBe(orgSlugFromName('grupo hng'))
  })

  it('nunca devuelve vacío ni bordes sucios', () => {
    expect(orgSlugFromName('')).toBe('org')
    expect(orgSlugFromName('!!!')).toBe('org')
    expect(orgSlugFromName('--hola--')).toBe('hola')
  })

  it('acota el largo', () => {
    expect(orgSlugFromName('a'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
})
