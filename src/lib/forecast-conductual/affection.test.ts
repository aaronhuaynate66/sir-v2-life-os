// SIR V2 — Tests del léxico/serie de afecto expresado (IAE).

import { describe, it, expect } from 'vitest'
import { scoreMessage, affectionForTexts } from './affection'

describe('scoreMessage', () => {
  it('detecta declaración explícita (peso 3)', () => {
    const s = scoreMessage('te amo muchísimo')
    expect(s.hasExplicit).toBe(true)
    expect(s.score).toBeGreaterThanOrEqual(3)
  })
  it('detecta apodo/petname (peso 2)', () => {
    const s = scoreMessage('buenas mi vida, ¿cómo amaneciste?')
    expect(s.hasPetname).toBe(true)
    expect(s.score).toBeGreaterThanOrEqual(2)
  })
  it('detecta emoji de cariño sobre el texto crudo (peso 1)', () => {
    const s = scoreMessage('jajaja 🥰')
    expect(s.hasEmoji).toBe(true)
    expect(s.score).toBeGreaterThanOrEqual(1)
  })
  it('detecta otras positivas/afiliación (peso 0.5)', () => {
    const s = scoreMessage('gracias por todo, cuídate')
    expect(s.hasOther).toBe(true)
    expect(s.score).toBeCloseTo(0.5)
  })
  it('marca negativo para el ratio', () => {
    const s = scoreMessage('déjame en paz, ya fue')
    expect(s.isNegative).toBe(true)
    expect(s.score).toBe(0)
  })
  it('mensaje neutro no puntúa', () => {
    const s = scoreMessage('llego a las 5 entonces')
    expect(s.score).toBe(0)
    expect(s.isNegative).toBe(false)
  })
  it('es robusto a tildes y mayúsculas', () => {
    expect(scoreMessage('TE QUIERO').hasExplicit).toBe(true)
    expect(scoreMessage('Mi Amór').hasPetname).toBe(true)
  })
})

describe('affectionForTexts', () => {
  it('día vacío → afecto 0, ratio 1', () => {
    expect(affectionForTexts([])).toEqual({ affection: 0, positivityRatio: 1 })
  })
  it('densidad más alta cuando hay más afecto', () => {
    const cariñoso = affectionForTexts(['te amo mi amor ❤️', 'te extraño bebé', 'gracias mi vida'])
    const seco = affectionForTexts(['ok', 'ya', 'llego 5pm', 'listo'])
    expect(cariñoso.affection).toBeGreaterThan(seco.affection)
    expect(cariñoso.affection).toBeGreaterThan(0)
    expect(seco.affection).toBe(0)
  })
  it('la densidad queda acotada 0..1', () => {
    const { affection } = affectionForTexts(Array(10).fill('te amo mi amor ❤️'))
    expect(affection).toBeGreaterThan(0)
    expect(affection).toBeLessThanOrEqual(1)
  })
  it('el ratio de positividad baja con marcadores negativos', () => {
    const bueno = affectionForTexts(['te amo', 'gracias'])
    const conflictivo = affectionForTexts(['te amo', 'te odio, déjame', 'no quiero hablar'])
    expect(bueno.positivityRatio).toBeGreaterThan(conflictivo.positivityRatio)
  })
})
