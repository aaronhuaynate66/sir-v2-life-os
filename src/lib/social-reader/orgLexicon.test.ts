import { describe, it, expect } from 'vitest'

import { pistaDebilEnHandle, pistaFuerteEnHandle, pistaCreible, tokensDeHandle } from './orgLexicon'

describe('tokensDeHandle', () => {
  it('parte por punto, guion bajo y guion', () => {
    expect(tokensDeHandle('@ds.express.peru')).toEqual(['ds', 'express', 'peru'])
    expect(tokensDeHandle('k9_peru_sac')).toEqual(['k', 'peru', 'sac'])
  })

  it('saca los dígitos del final (@expoispperu1 → …peru)', () => {
    expect(tokensDeHandle('expoispperu1')).toEqual(['expoispperu'])
  })
})

describe('pistaCreible', () => {
  it('una pista de 4+ letras vale como subcadena', () => {
    expect(pistaCreible('consultorabc', 'consultora')).toBe(true)
    expect(pistaCreible('braintechperu', 'tech')).toBe(true)
  })

  it('una pista de 3 letras SOLO vale en el borde del token', () => {
    // El bug real: "spa" dentro de "fra·spa·ravencedor" marcaba
    // @frasesparavencedor_ como negocio. Es el mismo error de subcadena que hizo
    // pasar @giancarlopostigo por "Carlo".
    expect(pistaCreible('frasesparavencedor_', 'spa')).toBe(false)
    expect(pistaCreible('global_plastic_sac', 'sac')).toBe(true)
  })
})

describe('pistaFuerteEnHandle', () => {
  it('encuentra las palabras que SOLO estaban en el léxico del nombre', () => {
    // Estas cinco pasaban como personas porque la lista del handle nunca recibió
    // las palabras que la lista del nombre sí tenía. Es la regresión que justifica
    // que el léxico sea uno solo.
    expect(pistaFuerteEnHandle('impalaairguns')).toBe('airguns')
    expect(pistaFuerteEnHandle('johnholdenuniformes')).toBe('uniformes')
    expect(pistaFuerteEnHandle('clubdecaballeros')).toBe('club')
    expect(pistaFuerteEnHandle('comunidadtls')).toBe('comunidad')
    expect(pistaFuerteEnHandle('diarioelprofeta')).toBe('diario')
  })

  it('la geo cuenta como SUFIJO, no como prefijo de otra palabra', () => {
    // Los dos contienen "peru". Solo uno es un nombre comercial.
    expect(pistaFuerteEnHandle('cablemundoperu')).toBe('peru')
    expect(pistaFuerteEnHandle('peruanista_conservador')).toBeNull()
  })

  it("no confunde 'sa' con el final de un nombre español", () => {
    // 'sa' no está en el léxico a propósito: pescaría Rosa, Teresa, Elisa.
    expect(pistaFuerteEnHandle('teresa_quispe')).toBeNull()
    expect(pistaFuerteEnHandle('rosa.linda')).toBeNull()
  })

  it('un handle de persona no dispara nada', () => {
    for (const h of ['alexbusev', 'andysalcedovazq', 'dannaveronicaperea', 'diegomstein', 'jim_haley']) {
      expect(pistaFuerteEnHandle(h)).toBeNull()
    }
  })
})

describe('pistaDebilEnHandle', () => {
  it("'oficial' es débil: también la usan las personas públicas", () => {
    // @mastermunozoficial es la cuenta oficial de una PERSONA.
    expect(pistaDebilEnHandle('mastermunozoficial')).toBe('oficial')
    expect(pistaFuerteEnHandle('mastermunozoficial')).toBeNull()
  })
})
