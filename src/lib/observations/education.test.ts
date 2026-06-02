// SIR V2 — Tests de la reconciliación de educación (precedencia LinkedIn > RENIEC).
//
// El bug original: una persona mostraba el nivel de registro RENIEC ("Superior
// (2do año)") arriba Y la educación rica de LinkedIn más abajo, contradiciéndose.
// Esta lógica resuelve a UNA fuente de verdad mostrada, con LinkedIn mandando
// para educación y RENIEC conservado como secundario etiquetado.

import { describe, it, expect } from 'vitest'

import type { LinkedInOrgRef } from '../capture/linkedin/types'
import { reconcileEducation, formatLinkedInEducation } from './education'

const champagnat: LinkedInOrgRef = {
  name: 'Universidad Marcelino Champagnat',
  title: 'Business Administration and Management, General',
  dateRange: '2018 - 2020',
}

describe('formatLinkedInEducation', () => {
  it('"Carrera · Institución" cuando hay título', () => {
    expect(formatLinkedInEducation(champagnat)).toBe(
      'Business Administration and Management, General · Universidad Marcelino Champagnat',
    )
  })
  it('sólo institución cuando no hay título', () => {
    expect(formatLinkedInEducation({ name: 'MIT', title: null, dateRange: null })).toBe('MIT')
  })
})

describe('reconcileEducation — precedencia LinkedIn sobre RENIEC', () => {
  it('caso Diana: LinkedIn manda; RENIEC "2do año" baja a secundario etiquetado', () => {
    const r = reconcileEducation('Superior (2do año)', champagnat)
    expect(r.primary).toEqual({
      value: 'Business Administration and Management, General · Universidad Marcelino Champagnat',
      hint: '2018 - 2020',
      source: 'linkedin',
    })
    expect(r.secondary).toEqual({ value: 'Superior (2do año)', hint: null, source: 'registro' })
  })

  it('sin LinkedIn → el nivel de registro es la primaria (no se pierde)', () => {
    const r = reconcileEducation('Superior (2do año)', null)
    expect(r.primary).toEqual({ value: 'Superior (2do año)', hint: null, source: 'registro' })
    expect(r.secondary).toBeNull()
  })

  it('sólo LinkedIn (sin registro) → primaria LinkedIn, sin secundario', () => {
    const r = reconcileEducation('', champagnat)
    expect(r.primary?.source).toBe('linkedin')
    expect(r.secondary).toBeNull()
  })

  it('sin ningún dato → ambos null', () => {
    expect(reconcileEducation(null, null)).toEqual({ primary: null, secondary: null })
    expect(reconcileEducation('   ', undefined)).toEqual({ primary: null, secondary: null })
  })

  it('LinkedIn sin institución legible (name vacío) → cae al registro', () => {
    const r = reconcileEducation('Superior (2do año)', { name: '  ', title: 'X', dateRange: null })
    expect(r.primary).toEqual({ value: 'Superior (2do año)', hint: null, source: 'registro' })
    expect(r.secondary).toBeNull()
  })

  it('registro redundante con LinkedIn (mismo texto) → no se duplica como secundario', () => {
    const r = reconcileEducation(
      'business administration and management, general · universidad marcelino champagnat',
      champagnat,
    )
    expect(r.primary?.source).toBe('linkedin')
    expect(r.secondary).toBeNull()
  })

  it('LinkedIn sin rango de años → hint null', () => {
    const r = reconcileEducation(null, { name: 'PUCP', title: 'Derecho', dateRange: null })
    expect(r.primary).toEqual({ value: 'Derecho · PUCP', hint: null, source: 'linkedin' })
  })
})
