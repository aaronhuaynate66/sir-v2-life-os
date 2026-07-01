import { describe, expect, it } from 'vitest'

import { applyFeedback, parseEdgeKey, DEFAULT_MAGNITUDE } from './hebbian'
import { BASE_WEIGHT, edgeKey } from './types'

describe('brain/hebbian · applyFeedback', () => {
  it('reinforce suma magnitude al delta actual', () => {
    const next = applyFeedback({
      currentDelta: 0,
      action: 'reinforce',
      baseWeight: BASE_WEIGHT.family,
    })
    expect(next).toBe(DEFAULT_MAGNITUDE)
  })

  it('discard resta magnitude al delta actual', () => {
    const next = applyFeedback({
      currentDelta: 2,
      action: 'discard',
      baseWeight: BASE_WEIGHT.family,
    })
    expect(next).toBe(1)
  })

  it('acumula sobre delta ya positivo', () => {
    const a = applyFeedback({ currentDelta: 0, action: 'reinforce', baseWeight: BASE_WEIGHT.family })
    const b = applyFeedback({ currentDelta: a, action: 'reinforce', baseWeight: BASE_WEIGHT.family })
    expect(b).toBe(DEFAULT_MAGNITUDE * 2)
  })

  it('piso: no baja de -baseWeight (peso total no cae bajo 0)', () => {
    const base = BASE_WEIGHT.memory_person  // 2
    let d = 0
    for (let i = 0; i < 20; i++) {
      d = applyFeedback({ currentDelta: d, action: 'discard', baseWeight: base })
    }
    expect(d).toBe(-base)
    expect(base + d).toBe(0)
  })

  it('techo: no supera baseWeight * 2 (peso total max = base * 3)', () => {
    const base = BASE_WEIGHT.family  // 8
    let d = 0
    for (let i = 0; i < 50; i++) {
      d = applyFeedback({ currentDelta: d, action: 'reinforce', baseWeight: base })
    }
    expect(d).toBe(base * 2)
    expect(base + d).toBe(base * 3)
  })

  it('magnitude personalizada respeta la escala', () => {
    const next = applyFeedback({
      currentDelta: 0,
      action: 'reinforce',
      baseWeight: BASE_WEIGHT.family,
      magnitude: 0.25,
    })
    expect(next).toBe(0.25)
  })
})

describe('brain/hebbian · parseEdgeKey', () => {
  it('rompe correctamente una llave del projector', () => {
    const k = edgeKey('person', 'aaron', 'person', 'esteban', 'family')
    const parts = parseEdgeKey(k)
    expect(parts).toEqual({
      srcType: 'person',
      srcId: 'aaron',
      dstType: 'person',
      dstId: 'esteban',
      kind: 'family',
    })
  })

  it('rompe con srcId que contiene ":"', () => {
    // Defensivo. En la practica los ids son uuids, no tienen ":".
    const parts = parseEdgeKey('person:weird:src:person:dst:family')
    expect(parts).toEqual({
      srcType: 'person',
      srcId: 'weird:src',
      dstType: 'person',
      dstId: 'dst',
      kind: 'family',
    })
  })

  it('devuelve null con menos de 5 partes', () => {
    expect(parseEdgeKey('person:a:person:b')).toBeNull()
    expect(parseEdgeKey('')).toBeNull()
  })

  it('devuelve null si algun campo queda vacio', () => {
    expect(parseEdgeKey(':a:person:b:family')).toBeNull()
    expect(parseEdgeKey('person::person:b:family')).toBeNull()
  })
})
