// SIR V2 — Tests del chequeo de coherencia con valores (14·M6).

import { describe, it, expect } from 'vitest'
import { anchorsToCheck } from './valuesCheck'

describe('anchorsToCheck', () => {
  it('null/vacío → sin anclas', () => {
    expect(anchorsToCheck(null)).toEqual([])
    expect(anchorsToCheck({ yearAnchor: '', identityBio: '   ' })).toEqual([])
  })

  it('el ancla del año va primero', () => {
    const r = anchorsToCheck({ yearAnchor: 'Mudarme con mi perro', identityBio: 'Un padre presente' })
    expect(r.map((a) => a.label)).toEqual(['Tu ancla del año', 'Quién eres'])
    expect(r[0].text).toBe('Mudarme con mi perro')
  })

  it('solo la que tiene contenido', () => {
    const r = anchorsToCheck({ yearAnchor: null, identityBio: 'Bombero y fundador' })
    expect(r).toHaveLength(1)
    expect(r[0].label).toBe('Quién eres')
  })
})
