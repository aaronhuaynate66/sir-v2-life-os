import { describe, it, expect } from 'vitest'

import { inferGender } from './inferGender'

describe('inferGender', () => {
  it('lista curada → confianza alta', () => {
    expect(inferGender('Diana Carolina Díaz Sánchez')).toEqual({ gender: 'female', confidence: 'alta' })
    expect(inferGender('Esteban Huaynate')).toEqual({ gender: 'male', confidence: 'alta' })
    expect(inferGender('Nicolle Huaynate Espinoza')).toEqual({ gender: 'female', confidence: 'alta' })
    expect(inferGender('Jorge France')).toEqual({ gender: 'male', confidence: 'alta' })
  })

  it('toma solo el primer nombre y normaliza acentos/mayúsculas', () => {
    expect(inferGender('  ANDREA  Torres ').gender).toBe('female')
    expect(inferGender('Álvaro Silva').gender).toBe('male')
  })

  it('terminación española → confianza baja', () => {
    expect(inferGender('Xiomara Perez')).toEqual({ gender: 'female', confidence: 'baja' }) // -a
    expect(inferGender('Ernesto Loza')).toEqual({ gender: 'male', confidence: 'baja' })   // -o
  })

  it('ambiguos/unisex → sin guess (se pregunta)', () => {
    expect(inferGender('Sasa Aimo')).toEqual({ gender: null, confidence: null })
    expect(inferGender('Shian Navarro')).toEqual({ gender: null, confidence: null })
  })

  it('desconocido sin terminación clara → null', () => {
    expect(inferGender('Yeltsin Quispe')).toEqual({ gender: null, confidence: null })
    expect(inferGender('')).toEqual({ gender: null, confidence: null })
  })
})
