// SIR V2 — Tests de validación/normalización del payload de Apple Health (file path).

import { describe, it, expect } from 'vitest'

import { looksLikeHae, mergeHaePayloads, parseHaeJson, HaeImportError } from './payload'
import type { HealthAutoExportPayload } from '@/lib/health/ingest/types'

describe('looksLikeHae', () => {
  it('acepta el formato estándar { data: { metrics: [] } }', () => {
    expect(looksLikeHae({ data: { metrics: [] } })).toBe(true)
  })

  it('acepta metrics en la raíz', () => {
    expect(looksLikeHae({ metrics: [] })).toBe(true)
  })

  it('rechaza objetos sin metrics', () => {
    expect(looksLikeHae({ data: {} })).toBe(false)
    expect(looksLikeHae({ foo: 'bar' })).toBe(false)
    expect(looksLikeHae({ data: { metrics: 'no-array' } })).toBe(false)
  })

  it('rechaza no-objetos', () => {
    expect(looksLikeHae(null)).toBe(false)
    expect(looksLikeHae(undefined)).toBe(false)
    expect(looksLikeHae('texto')).toBe(false)
    expect(looksLikeHae(42)).toBe(false)
    expect(looksLikeHae([])).toBe(false)
  })
})

describe('parseHaeJson', () => {
  it('parsea un JSON válido con forma HAE', () => {
    const out = parseHaeJson('{"data":{"metrics":[{"name":"step_count","data":[]}]}}')
    expect(out.data?.metrics?.length).toBe(1)
  })

  it('lanza HaeImportError ante JSON inválido', () => {
    expect(() => parseHaeJson('{ no es json')).toThrow(HaeImportError)
    expect(() => parseHaeJson('{ no es json')).toThrow(/no es un JSON válido/i)
  })

  it('lanza HaeImportError ante JSON válido pero forma inesperada', () => {
    expect(() => parseHaeJson('{"hola":"mundo"}')).toThrow(HaeImportError)
    expect(() => parseHaeJson('{"hola":"mundo"}')).toThrow(/Apple Health/i)
  })

  it('lanza ante un array JSON (no es el objeto esperado)', () => {
    expect(() => parseHaeJson('[1,2,3]')).toThrow(HaeImportError)
  })
})

describe('mergeHaePayloads', () => {
  it('concatena las métricas de varios payloads en formato canónico', () => {
    const a: HealthAutoExportPayload = { data: { metrics: [{ name: 'weight_body_mass', data: [] }] } }
    const b: HealthAutoExportPayload = { data: { metrics: [{ name: 'step_count', data: [] }] } }
    const merged = mergeHaePayloads([a, b])
    expect(merged.data?.metrics?.map((m) => m.name)).toEqual(['weight_body_mass', 'step_count'])
  })

  it('tolera payloads con metrics en la raíz', () => {
    const a: HealthAutoExportPayload = { metrics: [{ name: 'vo2_max', data: [] }] }
    const merged = mergeHaePayloads([a])
    expect(merged.data?.metrics?.length).toBe(1)
    expect(merged.data?.metrics?.[0].name).toBe('vo2_max')
  })

  it('produce un payload vacío válido ante lista vacía', () => {
    const merged = mergeHaePayloads([])
    expect(merged.data?.metrics).toEqual([])
  })
})
