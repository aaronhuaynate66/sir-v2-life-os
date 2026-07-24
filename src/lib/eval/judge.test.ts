import { describe, it, expect } from 'vitest'
import { buildJudgePrompt, parseJudgeVerdict, feedbackToCase, PASS_THRESHOLD, type EvalCase } from './judge'

const caso: EvalCase = { id: 'c1', question: '¿Qué sé de Diana?', expect: 'Menciona que es su pareja', mustNotDo: 'inventar fechas' }

describe('buildJudgePrompt', () => {
  it('incluye pregunta, expect, mustNotDo, y pide JSON con las 5 dimensiones', () => {
    const p = buildJudgePrompt(caso, 'Diana es tu pareja.')
    expect(p).toContain('¿Qué sé de Diana?')
    expect(p).toContain('Menciona que es su pareja')
    expect(p).toContain('inventar fechas')
    expect(p).toContain('Diana es tu pareja.')
    for (const d of ['grounding', 'honesty', 'language', 'usefulness', 'tone']) expect(p).toContain(d)
  })
})

describe('parseJudgeVerdict', () => {
  it('parsea un veredicto completo y decide pass por umbral', () => {
    const v = parseJudgeVerdict('{"grounding":90,"honesty":85,"language":100,"usefulness":80,"tone":88,"overall":86,"reasons":"bien"}')
    expect(v.score).toBe(86)
    expect(v.pass).toBe(true)
    expect(v.dims.language).toBe(100)
    expect(v.reasons).toBe('bien')
  })

  it('overall bajo → no pasa', () => {
    expect(parseJudgeVerdict('{"grounding":40,"honesty":30,"language":100,"usefulness":50,"tone":60,"overall":35}').pass).toBe(false)
  })

  it('sin overall → usa el mínimo de las dimensiones críticas (no el promedio)', () => {
    // grounding 20 (inventó) hunde el overall aunque el resto esté alto
    const v = parseJudgeVerdict('{"grounding":20,"honesty":90,"language":100,"usefulness":90,"tone":90}')
    expect(v.score).toBe(20)
    expect(v.pass).toBe(false)
  })

  it('clampa fuera de rango y tolera texto alrededor', () => {
    const v = parseJudgeVerdict('ok: {"grounding":150,"honesty":-5,"language":80,"usefulness":80,"tone":80,"overall":120} fin')
    expect(v.dims.grounding).toBe(100)
    expect(v.dims.honesty).toBe(0)
    expect(v.score).toBe(100)
  })

  it('basura/vacío → veredicto vacío (no infla)', () => {
    expect(parseJudgeVerdict('no sé').score).toBe(0)
    expect(parseJudgeVerdict('').pass).toBe(false)
    expect(parseJudgeVerdict('no sé').dims.tone).toBe(0)
  })

  it('respeta un umbral custom', () => {
    const raw = '{"grounding":75,"honesty":75,"language":75,"usefulness":75,"tone":75,"overall":75}'
    expect(parseJudgeVerdict(raw, 80).pass).toBe(false)
    expect(parseJudgeVerdict(raw, 70).pass).toBe(true)
  })
})

describe('feedbackToCase', () => {
  it('👎 con corrección → expect = la corrección', () => {
    const c = feedbackToCase({ id: 'x', question: '¿mañana?', answer: 'floro', rating: 'down', correction: 'sé más concreto' })
    expect(c.id).toBe('fb:x')
    expect(c.expect).toContain('sé más concreto')
    expect(c.tags).toContain('down')
  })
  it('👍 → caso positivo', () => {
    const c = feedbackToCase({ id: 'y', question: 'q', answer: 'a', rating: 'up', correction: null })
    expect(c.expect).toContain('👍')
    expect(c.tags).toContain('up')
  })
})

describe('PASS_THRESHOLD', () => {
  it('es un número razonable', () => { expect(PASS_THRESHOLD).toBeGreaterThan(0); expect(PASS_THRESHOLD).toBeLessThanOrEqual(100) })
})
