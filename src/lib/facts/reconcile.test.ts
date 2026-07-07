import { describe, it, expect } from 'vitest'

import { reconcileFacts, factAttribute, isRelocation } from './reconcile'

describe('isRelocation', () => {
  it('mudanza inequívoca (se mudó/se instaló/…)', () => {
    expect(isRelocation('se mudó a un depa nuevo')).toBe(true)
    expect(isRelocation('se instaló en el centro')).toBe(true)
    expect(isRelocation('se fue a vivir sola')).toBe(true)
  })
  it('mudanza ambigua solo con nombre propio', () => {
    expect(isRelocation('Llegó a Alicante para su maestría')).toBe(true)
    expect(isRelocation('se fue a Madrid')).toBe(true)
    expect(isRelocation('llegó a un acuerdo con su jefe')).toBe(false)
    expect(isRelocation('llegó a las 5 de la tarde')).toBe(false)
  })
  it('vivir/vive NO es mudanza', () => {
    expect(isRelocation('vive con su esposo')).toBe(false)
    expect(isRelocation('vive en Lima')).toBe(false)
  })
})

describe('factAttribute', () => {
  it('residencia por vivienda o mudanza', () => {
    expect(factAttribute('vive con Aaron')).toBe('residence')
    expect(factAttribute('se mudó a Barranco')).toBe('residence')
  })
  it('ocupación y otros → null', () => {
    expect(factAttribute('trabaja en la notaría')).toBeNull()
    expect(factAttribute('tiene un perro')).toBeNull()
  })
})

describe('reconcileFacts (conservador: solo mudanza supersede)', () => {
  it('caso Nicolle: la mudanza pisa la vivienda anterior', () => {
    const r = reconcileFacts(['vive con Aaron (comparten vivienda)', 'se mudó a inicios de noviembre de 2024'])
    expect(r.facts).toEqual(['se mudó a inicios de noviembre de 2024'])
    expect(r.superseded).toHaveLength(1)
    expect(r.superseded[0]).toMatchObject({
      text: 'vive con Aaron (comparten vivienda)',
      attribute: 'residence',
    })
  })

  it('SIN mudanza, hechos de vivienda COMPLEMENTARIOS conviven (no se pisan)', () => {
    // El bug que rompió el backfill: "vive con el esposo" + "vive en Lima" son
    // complementarios, no contradictorios → ambos sobreviven.
    const r = reconcileFacts(['vive con Fernando (esposo)', 'vive en Lima y viaja a Tacna'])
    expect(r.facts).toHaveLength(2)
    expect(r.superseded).toHaveLength(0)
  })

  it('preserva orden y NO toca otros atributos; la mudanza pisa TODA vivienda anterior', () => {
    const r = reconcileFacts([
      'trabaja en la notaría',           // ocupación → intacto
      'vive con sus padres',             // vivienda vieja → obsoleta por la mudanza
      'tiene dos perros',                // otro → intacto
      'se mudó a Barranco',              // mudanza → pisa lo anterior
    ])
    expect(r.facts).toEqual(['trabaja en la notaría', 'tiene dos perros', 'se mudó a Barranco'])
    expect(r.superseded.map((s) => s.text)).toEqual(['vive con sus padres'])
  })

  it('vivienda DESPUÉS de la mudanza se conserva (describe la casa nueva)', () => {
    const r = reconcileFacts(['se mudó a Barranco', 'vive sola en un depa'])
    expect(r.facts).toEqual(['se mudó a Barranco', 'vive sola en un depa'])
    expect(r.superseded).toHaveLength(0)
  })

  it('sin nada de vivienda → todo intacto', () => {
    const r = reconcileFacts(['trabaja en X', 'tiene un gato', 'juega tenis'])
    expect(r.facts).toHaveLength(3)
    expect(r.superseded).toHaveLength(0)
  })
})
