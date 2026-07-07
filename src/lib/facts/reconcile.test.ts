import { describe, it, expect } from 'vitest'

import { reconcileFacts, factAttribute } from './reconcile'

describe('factAttribute', () => {
  it('residencia por verbo', () => {
    expect(factAttribute('vive con Aaron, comparten vivienda')).toBe('residence')
    expect(factAttribute('se mudó a un depa nuevo')).toBe('residence')
    expect(factAttribute('reside en Miraflores')).toBe('residence')
  })
  it('residencia por reubicación a nombre propio', () => {
    expect(factAttribute('Llegó a Alicante para su maestría')).toBe('residence')
    expect(factAttribute('se fue a Madrid')).toBe('residence')
  })
  it('NO confunde reubicación con frases comunes', () => {
    expect(factAttribute('llegó a un acuerdo con su jefe')).toBeNull()
    expect(factAttribute('llegó a las 5 de la tarde')).toBeNull()
    expect(factAttribute('llegó a tiempo a la reunión')).toBeNull()
  })
  it('estado civil', () => {
    expect(factAttribute('está soltera')).toBe('civil_status')
    expect(factAttribute('se casó el año pasado')).toBeNull() // "se casó" no está en el set (solo estados)
    expect(factAttribute('ahora está en pareja')).toBe('civil_status')
  })
  it('ocupación y otros → null (no se tocan)', () => {
    expect(factAttribute('trabaja en la notaría Rosalía Mejía')).toBeNull()
    expect(factAttribute('tiene un perro')).toBeNull()
  })
})

describe('reconcileFacts', () => {
  it('caso Nicolle: el más reciente pisa el viejo (misma residencia)', () => {
    const r = reconcileFacts(['vive con Aaron (comparten vivienda)', 'Llegó a Alicante'])
    expect(r.facts).toEqual(['Llegó a Alicante'])
    expect(r.superseded).toHaveLength(1)
    expect(r.superseded[0]).toMatchObject({
      text: 'vive con Aaron (comparten vivienda)',
      supersededBy: 'Llegó a Alicante',
      attribute: 'residence',
    })
  })

  it('preserva orden y NO toca hechos de otros atributos', () => {
    const input = [
      'trabaja en la notaría',      // ocupación → intacto
      'vive en Lima',               // residencia vieja → superseded
      'tiene dos perros',           // otro → intacto
      'se mudó a Barranco',         // residencia nueva → gana
    ]
    const r = reconcileFacts(input)
    expect(r.facts).toEqual(['trabaja en la notaría', 'tiene dos perros', 'se mudó a Barranco'])
    expect(r.superseded.map((s) => s.text)).toEqual(['vive en Lima'])
  })

  it('un solo hecho por atributo → nada se supersede', () => {
    const r = reconcileFacts(['vive en Lima', 'trabaja en X', 'está soltera'])
    expect(r.facts).toHaveLength(3)
    expect(r.superseded).toHaveLength(0)
  })

  it('ocupación múltiple NO se reconcilia (hechos complementarios sobreviven)', () => {
    const r = reconcileFacts(['trabaja en la notaría', 'la ascendieron a jefa de área'])
    expect(r.facts).toHaveLength(2)
    expect(r.superseded).toHaveLength(0)
  })

  it('estado civil: el más reciente gana', () => {
    const r = reconcileFacts(['estaba de novia con Juan', 'ahora está soltera'])
    expect(r.facts).toEqual(['ahora está soltera'])
    expect(r.superseded[0].attribute).toBe('civil_status')
  })
})
