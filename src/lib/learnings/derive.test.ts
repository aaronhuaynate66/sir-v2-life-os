import { describe, it, expect } from 'vitest'
import { buildDeriveInput, parseDerivedLearnings, MAX_DERIVED } from './derive'

describe('buildDeriveInput', () => {
  it('incluye fragmentos y lo ya sabido', () => {
    const out = buildDeriveInput(['dije que odio las reuniones largas'], ['Entrena taekwondo'])
    expect(out).toMatch(/odio las reuniones largas/)
    expect(out).toMatch(/Entrena taekwondo/)
  })
  it('maneja vacíos sin romper', () => {
    const out = buildDeriveInput([], [])
    expect(out).toMatch(/\(ninguno\)/)
    expect(out).toMatch(/\(ninguna\)/)
  })
})

describe('parseDerivedLearnings', () => {
  it('parsea un array válido', () => {
    const r = parseDerivedLearnings('[{"text":"Prefiere trabajar de mañana","kind":"preference","confidence":"medium"}]')
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('preference')
  })
  it('tolera fences ```json', () => {
    const r = parseDerivedLearnings('```json\n[{"text":"Prioriza la familia","kind":"principle","confidence":"high"}]\n```')
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('principle')
  })
  it('topa la confianza en medium (high → medium)', () => {
    const r = parseDerivedLearnings('[{"text":"Entrena taekwondo","kind":"fact","confidence":"high"}]')
    expect(r[0].confidence).toBe('medium')
  })
  it('normaliza kind/confidence inválidos', () => {
    const r = parseDerivedLearnings('[{"text":"algo estable","kind":"xxx","confidence":"yyy"}]')
    expect(r[0].kind).toBe('pattern') // default
    expect(r[0].confidence).toBe('medium') // default
  })
  it('descarta texto vacío o muy corto', () => {
    expect(parseDerivedLearnings('[{"text":"","kind":"fact"},{"text":"ab","kind":"fact"}]')).toHaveLength(0)
  })
  it('dedupe por texto (case-insensitive)', () => {
    const r = parseDerivedLearnings('[{"text":"Prefiere café","kind":"preference"},{"text":"prefiere café","kind":"preference"}]')
    expect(r).toHaveLength(1)
  })
  it('respeta el máximo', () => {
    const many = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ text: `leccion numero ${i}`, kind: 'fact', confidence: 'low' })))
    expect(parseDerivedLearnings(many).length).toBe(MAX_DERIVED)
  })
  it('lista vacía o basura → []', () => {
    expect(parseDerivedLearnings('[]')).toEqual([])
    expect(parseDerivedLearnings('no soy json')).toEqual([])
    expect(parseDerivedLearnings('{"text":"no es array"}')).toEqual([])
  })
})
