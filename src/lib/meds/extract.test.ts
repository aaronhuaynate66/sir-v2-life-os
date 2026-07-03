// SIR V2 — Tests de la validación/sanitización de extracción de medicamentos.

import { describe, it, expect } from 'vitest'
import { isValidMedExtracted, sanitizeMedExtracted } from './extract'

describe('isValidMedExtracted', () => {
  it('acepta si viene al menos un campo informativo', () => {
    expect(isValidMedExtracted({ name: 'Ergonex Plus' })).toBe(true)
    expect(isValidMedExtracted({ component: 'ergotamina 1mg' })).toBe(true)
  })
  it('rechaza objetos vacíos o basura', () => {
    expect(isValidMedExtracted({})).toBe(false)
    expect(isValidMedExtracted({ confidence: 'high' })).toBe(false)
    expect(isValidMedExtracted(null)).toBe(false)
    expect(isValidMedExtracted('x')).toBe(false)
  })
})

describe('sanitizeMedExtracted', () => {
  it('mapea snake_case del modelo + recorta', () => {
    const out = sanitizeMedExtracted({
      name: '  Ergonex Plus ', component: 'ergotamina 1mg + cafeína 100mg + paracetamol 300mg',
      drug_class: 'antimigrañoso', treats: 'migraña, cefalea vasomotora', confidence: 'high',
    })
    expect(out).toEqual({
      name: 'Ergonex Plus',
      component: 'ergotamina 1mg + cafeína 100mg + paracetamol 300mg',
      drugClass: 'antimigrañoso',
      treats: 'migraña, cefalea vasomotora',
      confidence: 'high',
    })
  })
  it('confidence inválida cae a low; campos faltantes a null', () => {
    const out = sanitizeMedExtracted({ name: 'X', confidence: 'altísima' })
    expect(out.confidence).toBe('low')
    expect(out.component).toBeNull()
    expect(out.drugClass).toBeNull()
  })
  it('acepta drugClass camelCase también', () => {
    expect(sanitizeMedExtracted({ drugClass: 'analgésico' }).drugClass).toBe('analgésico')
  })
})
