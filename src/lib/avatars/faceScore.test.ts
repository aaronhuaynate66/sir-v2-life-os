import { describe, it, expect } from 'vitest'
import { parseFaceAssessment, scoreFaceCandidate, MIN_FACE_SCORE, type FaceAssessment } from './faceScore'

describe('parseFaceAssessment', () => {
  it('parsea una cara clara y frontal', () => {
    const a = parseFaceAssessment('{"found":true,"x":0.3,"y":0.2,"w":0.4,"h":0.4,"frontal":true,"clarity":"clear","faceCount":1}')
    expect(a.found).toBe(true)
    expect(a.frontal).toBe(true)
    expect(a.clarity).toBe('clear')
    expect(a.box).toEqual({ x: 0.3, y: 0.2, w: 0.4, h: 0.4 })
  })

  it('found:false → sin cara', () => {
    expect(parseFaceAssessment('{"found":false}').found).toBe(false)
  })

  it('clarity none o sin caja → sin cara', () => {
    expect(parseFaceAssessment('{"found":true,"clarity":"none"}').found).toBe(false)
    expect(parseFaceAssessment('{"found":true,"clarity":"clear"}').found).toBe(false) // sin caja
  })

  it('clampa la caja a 0..1 y tolera texto alrededor', () => {
    const a = parseFaceAssessment('ok: {"found":true,"x":-1,"y":0.5,"w":2,"h":0.3,"clarity":"partial"} fin')
    expect(a.box).toEqual({ x: 0, y: 0.5, w: 1, h: 0.3 })
  })

  it('basura → sin cara', () => {
    expect(parseFaceAssessment('nada').found).toBe(false)
    expect(parseFaceAssessment('').found).toBe(false)
  })
})

const base: FaceAssessment = { found: true, box: { x: 0.3, y: 0.2, w: 0.4, h: 0.4 }, frontal: true, clarity: 'clear', faceCount: 1 }

describe('scoreFaceCandidate', () => {
  it('cara clara + frontal + una persona supera el mínimo', () => {
    expect(scoreFaceCandidate(base)).toBeGreaterThanOrEqual(MIN_FACE_SCORE)
  })

  it('cara clara pero de perfil (no frontal) puntúa menos que frontal', () => {
    expect(scoreFaceCandidate({ ...base, frontal: false })).toBeLessThan(scoreFaceCandidate(base))
  })

  it('cara parcial y no frontal cae por debajo del mínimo (se descarta)', () => {
    expect(scoreFaceCandidate({ ...base, clarity: 'partial', frontal: false, box: { x: 0, y: 0, w: 0.1, h: 0.1 } })).toBeLessThan(MIN_FACE_SCORE)
  })

  it('más de una cara (grupo / sugeridos) → descartada', () => {
    expect(scoreFaceCandidate({ ...base, faceCount: 4 })).toBe(0)
    expect(scoreFaceCandidate({ ...base, faceCount: 2 })).toBe(0)
    expect(scoreFaceCandidate({ ...base, faceCount: 0 })).toBe(0)
  })

  it('cara parcial (chica/borrosa/lejana) aunque sea frontal → descartada', () => {
    expect(scoreFaceCandidate({ ...base, clarity: 'partial' })).toBe(0)
  })

  it('sin cara → 0', () => {
    expect(scoreFaceCandidate({ found: false, box: null, frontal: false, clarity: 'none', faceCount: 0 })).toBe(0)
  })

  it('cara más grande puntúa más que una diminuta', () => {
    const big = scoreFaceCandidate({ ...base, box: { x: 0.2, y: 0.1, w: 0.6, h: 0.7 } })
    const small = scoreFaceCandidate({ ...base, box: { x: 0.4, y: 0.4, w: 0.08, h: 0.08 } })
    expect(big).toBeGreaterThan(small)
  })
})
