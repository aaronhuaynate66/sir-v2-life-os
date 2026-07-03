// SIR V2 — Tests de la capa pura de extracción de seed batch (C1).

import { describe, it, expect } from 'vitest'
import { buildSeedExtractSystemPrompt, stripFences, parseSeedExtractJson } from './extractPrompt'

describe('buildSeedExtractSystemPrompt', () => {
  it('incluye los enums válidos (para no desincronizarse del planner)', () => {
    const p = buildSeedExtractSystemPrompt()
    expect(p).toContain('professional') // relationship
    expect(p).toContain('inner_circle') // category
    expect(p).toContain('linkedin_profile') // capture_type
    expect(p).toContain('SELF') // sentinel del usuario
  })
})

describe('stripFences', () => {
  it('quita fences json', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('quita fences pelados', () => {
    expect(stripFences('```\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('deja el texto tal cual si no hay fences', () => {
    expect(stripFences('{"a":1}')).toBe('{"a":1}')
  })
})

describe('parseSeedExtractJson', () => {
  it('parsea un batch válido', () => {
    const raw = '{"_meta":{"source":"x"},"people":[{"person":{"name":"Ana"}}],"person_links":[]}'
    const out = parseSeedExtractJson(raw)
    expect(out?.people?.[0]?.person.name).toBe('Ana')
    expect(out?._meta).toEqual({ source: 'x' })
  })
  it('tolera fences', () => {
    const out = parseSeedExtractJson('```json\n{"people":[{"person":{"name":"Beto"}}]}\n```')
    expect(out?.people?.[0]?.person.name).toBe('Beto')
  })
  it('normaliza people faltante a []', () => {
    expect(parseSeedExtractJson('{"_meta":{}}')?.people).toEqual([])
  })
  it('conserva person_links si vienen', () => {
    const out = parseSeedExtractJson('{"people":[],"person_links":[{"person_a":"Ana","person_b":"SELF","kind":"colega"}]}')
    expect(out?.person_links?.[0]?.kind).toBe('colega')
  })
  it('devuelve null si no parsea', () => {
    expect(parseSeedExtractJson('no soy json')).toBeNull()
  })
  it('devuelve null si es un array (no un objeto batch)', () => {
    expect(parseSeedExtractJson('[1,2,3]')).toBeNull()
  })
})
