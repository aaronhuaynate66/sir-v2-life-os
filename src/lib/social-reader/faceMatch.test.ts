import { describe, it, expect } from 'vitest'
import { buildFaceMatchPrompt, parseFaceMatchResponse } from './faceMatch'

describe('buildFaceMatchPrompt', () => {
  it('menciona el rango de candidatos y pide JSON', () => {
    const p = buildFaceMatchPrompt(6)
    expect(p).toContain('1 al 6')
    expect(p).toContain('"match"')
    expect(p).toContain('null')
  })
})

describe('parseFaceMatchResponse', () => {
  it('acepta un match con confianza alta', () => {
    expect(parseFaceMatchResponse('{"match": 3, "confidence": "alta"}', 6)).toEqual({ index: 3, confidence: 'alta' })
  })

  it('acepta confianza media', () => {
    expect(parseFaceMatchResponse('{"match": 1, "confidence": "media"}', 6)).toEqual({ index: 1, confidence: 'media' })
  })

  it('confianza baja → sin match (conservador)', () => {
    expect(parseFaceMatchResponse('{"match": 2, "confidence": "baja"}', 6)).toEqual({ index: null, confidence: null })
  })

  it('match null → sin sugerencia', () => {
    expect(parseFaceMatchResponse('{"match": null, "confidence": "alta"}', 6)).toEqual({ index: null, confidence: null })
  })

  it('índice fuera de rango → sin match', () => {
    expect(parseFaceMatchResponse('{"match": 9, "confidence": "alta"}', 6)).toEqual({ index: null, confidence: null })
    expect(parseFaceMatchResponse('{"match": 0, "confidence": "alta"}', 6)).toEqual({ index: null, confidence: null })
  })

  it('tolera texto alrededor del JSON', () => {
    expect(parseFaceMatchResponse('Claro: {"match": 4, "confidence": "media"} listo', 6)).toEqual({ index: 4, confidence: 'media' })
  })

  it('confianza inválida → sin match', () => {
    expect(parseFaceMatchResponse('{"match": 2, "confidence": "seguro"}', 6)).toEqual({ index: null, confidence: null })
  })

  it('basura / vacío → sin match', () => {
    expect(parseFaceMatchResponse('no sé', 6)).toEqual({ index: null, confidence: null })
    expect(parseFaceMatchResponse('', 6)).toEqual({ index: null, confidence: null })
    expect(parseFaceMatchResponse('{"match": 3, "confidence": "alta"}', 0)).toEqual({ index: null, confidence: null })
  })

  it('match no entero → sin match', () => {
    expect(parseFaceMatchResponse('{"match": 2.5, "confidence": "alta"}', 6)).toEqual({ index: null, confidence: null })
  })
})
