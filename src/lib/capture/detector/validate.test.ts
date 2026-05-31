// SIR V2 — Tests del validator/sanitizer del DETECTOR universal.
//
// El guard es la única barrera entre el JSON crudo de Vision y el ruteo del
// pipeline. Cubrimos: acepta cada tipo (incl. scale), tolera whitespace en
// el enum, rechaza tipos fuera del set / confidence inválida / shape rota, y
// la normalización del sanitize (trim de type/confidence/reasoning/persona).

import { describe, it, expect } from 'vitest'

import type { DetectorResult } from '../observations/types'
import { isValidDetectorResult, sanitizeDetectorResult } from './validate'

const valid = (over: Partial<DetectorResult> = {}): DetectorResult => ({
  type: 'whatsapp_chat',
  confidence: 'high',
  reasoning: 'Bubbles verde/gris en columnas + header con nombre',
  suggestedPersonName: 'Diana',
  ...over,
})

describe('isValidDetectorResult — tipos aceptados', () => {
  it('acepta scale (báscula) como tipo válido del detector', () => {
    expect(isValidDetectorResult(valid({ type: 'scale', suggestedPersonName: null }))).toBe(true)
  })

  it('acepta todos los tipos que el detector puede emitir', () => {
    for (const type of [
      'whatsapp_chat',
      'whatsapp_web',
      'whatsapp_info',
      'instagram',
      'linkedin',
      'scale',
      'unknown',
    ] as const) {
      expect(isValidDetectorResult(valid({ type }))).toBe(true)
    }
  })

  it('tolera whitespace/newline en el enum (Vision emite "scale\\n")', () => {
    expect(isValidDetectorResult(valid({ type: 'scale\n' as 'scale' }))).toBe(true)
    expect(isValidDetectorResult(valid({ type: '  scale ' as 'scale' }))).toBe(true)
    expect(isValidDetectorResult(valid({ confidence: 'high ' as 'high' }))).toBe(true)
  })
})

describe('isValidDetectorResult — rechazos', () => {
  it('rechaza un tipo fuera del set', () => {
    expect(isValidDetectorResult(valid({ type: 'telegram' as 'unknown' }))).toBe(false)
  })

  it('rechaza confidence inválida', () => {
    expect(isValidDetectorResult(valid({ confidence: 'altísima' as 'high' }))).toBe(false)
  })

  it('rechaza shape rota / no-objeto', () => {
    expect(isValidDetectorResult(null)).toBe(false)
    expect(isValidDetectorResult([])).toBe(false)
    expect(isValidDetectorResult({ type: 'scale' })).toBe(false) // falta confidence/reasoning
    expect(isValidDetectorResult(valid({ reasoning: 123 as unknown as string }))).toBe(false)
  })

  it('rechaza suggestedPersonName que no es string ni null', () => {
    expect(isValidDetectorResult(valid({ suggestedPersonName: 42 as unknown as null }))).toBe(false)
  })
})

describe('sanitizeDetectorResult — normalización', () => {
  it('trimea el enum tolerado a su forma limpia', () => {
    const out = sanitizeDetectorResult(valid({ type: 'scale\n' as 'scale', confidence: 'high ' as 'high' }))
    expect(out.type).toBe('scale')
    expect(out.confidence).toBe('high')
  })

  it('trimea reasoning y clampa a 200 chars', () => {
    const long = 'x'.repeat(500)
    const out = sanitizeDetectorResult(valid({ reasoning: `  ${long}  ` }))
    expect(out.reasoning.length).toBe(200)
  })

  it('suggestedPersonName vacío/whitespace -> null', () => {
    expect(sanitizeDetectorResult(valid({ suggestedPersonName: '   ' })).suggestedPersonName).toBe(null)
    expect(sanitizeDetectorResult(valid({ suggestedPersonName: null })).suggestedPersonName).toBe(null)
  })
})
