import { describe, it, expect } from 'vitest'
import { generateTokenParts } from './tokens'
import { formatRelative } from './tokensFormat'

describe('generateTokenParts', () => {
  it('genera un token con prefix sirp_ y 24+ chars de entropía', () => {
    const { plain, prefix, hash } = generateTokenParts()
    expect(plain.startsWith('sirp_')).toBe(true)
    expect(plain.length).toBeGreaterThanOrEqual(25)
    expect(prefix.length).toBe(10)
    expect(plain.startsWith(prefix)).toBe(true)
    // Hash SHA-256 hex → 64 chars.
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('cada llamada genera valores distintos (alta entropía)', () => {
    const a = generateTokenParts()
    const b = generateTokenParts()
    expect(a.plain).not.toBe(b.plain)
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('formatRelative', () => {
  it('null → "nunca usado"', () => {
    expect(formatRelative(null)).toBe('nunca usado')
  })
  it('ISO inválido → "nunca usado"', () => {
    expect(formatRelative('not-a-date')).toBe('nunca usado')
  })
  it('ahora mismo (< 1 min)', () => {
    expect(formatRelative(new Date().toISOString())).toBe('ahora mismo')
  })
  it('hace 5 minutos', () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(formatRelative(iso)).toBe('hace 5m')
  })
  it('hace 3 horas', () => {
    const iso = new Date(Date.now() - 3 * 60 * 60_000).toISOString()
    expect(formatRelative(iso)).toBe('hace 3h')
  })
  it('ayer', () => {
    const iso = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    expect(formatRelative(iso)).toBe('ayer')
  })
})
