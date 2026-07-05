// SIR V2 — Tests del capturador de vínculos profesionales/sociales (0128).

import { describe, it, expect } from 'vitest'
import { inverseProKindLabel, categoryForProKind, PRO_KIND_LABEL } from './professional'
import { isFamilyLink } from './family'
import type { PersonLink } from '@/types'

describe('professional links', () => {
  it('rol inverso: jefe↔reporte, mentor↔mentoreado, cliente↔proveedor', () => {
    expect(inverseProKindLabel('jefe')).toBe(PRO_KIND_LABEL.reporte)
    expect(inverseProKindLabel('reporte')).toBe(PRO_KIND_LABEL.jefe)
    expect(inverseProKindLabel('mentor')).toBe(PRO_KIND_LABEL.mentoreado)
    expect(inverseProKindLabel('cliente')).toBe(PRO_KIND_LABEL.proveedor)
  })

  it('roles simétricos se leen igual en ambos extremos', () => {
    expect(inverseProKindLabel('colega')).toBe(PRO_KIND_LABEL.colega)
    expect(inverseProKindLabel('socio')).toBe(PRO_KIND_LABEL.socio)
  })

  it('categoría por rol: contacto/conocido = social; el resto profesional', () => {
    expect(categoryForProKind('conocido')).toBe('social')
    expect(categoryForProKind('contacto')).toBe('social')
    expect(categoryForProKind('colega')).toBe('profesional')
    expect(categoryForProKind('cliente')).toBe('profesional')
  })
})

describe('isFamilyLink (0128)', () => {
  const base: Omit<PersonLink, 'category'> = { id: 'l', personAId: 'a', personBId: 'b', kind: 'madre', createdAt: '' }
  it('null/undefined/familia → familia (back-compat)', () => {
    expect(isFamilyLink({ ...base } as PersonLink)).toBe(true)
    expect(isFamilyLink({ ...base, category: null })).toBe(true)
    expect(isFamilyLink({ ...base, category: 'familia' })).toBe(true)
  })
  it('profesional/social → NO familia', () => {
    expect(isFamilyLink({ ...base, category: 'profesional' })).toBe(false)
    expect(isFamilyLink({ ...base, category: 'social' })).toBe(false)
  })
})
