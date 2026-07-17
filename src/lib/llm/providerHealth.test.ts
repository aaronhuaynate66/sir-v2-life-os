import { describe, it, expect } from 'vitest'
import { computeHealth, degradedProviders, providerOf, type UsageRow } from './providerHealth'

const NOW = Date.parse('2026-07-17T02:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
const row = (model: string, status: 'ok' | 'error', latency: number | null, minAgo = 5): UsageRow =>
  ({ model, status, latency_ms: latency, created_at: ago(minAgo) })

describe('providerOf', () => {
  it('extrae el prefijo de proveedor', () => {
    expect(providerOf('openrouter:deepseek/deepseek-chat')).toBe('openrouter')
    expect(providerOf('anthropic:claude-sonnet-4-5')).toBe('anthropic')
  })
  it('infiere anthropic de filas viejas sin prefijo', () => {
    expect(providerOf('claude-sonnet-4-5-20250929')).toBe('anthropic')
  })
  it('desconocido → null', () => {
    expect(providerOf('gpt-4o')).toBeNull()
    expect(providerOf('')).toBeNull()
    expect(providerOf(null)).toBeNull()
  })
})

describe('computeHealth', () => {
  it('proveedor sano y rápido → healthy', () => {
    const rows = [row('openrouter:x', 'ok', 1200), row('openrouter:x', 'ok', 900), row('openrouter:x', 'ok', 1500)]
    const h = computeHealth(rows, { nowMs: NOW })
    expect(h.get('openrouter')!.verdict).toBe('healthy')
    expect(h.get('openrouter')!.successRate).toBe(1)
  })

  it('mayoría de fallos → down', () => {
    const rows = [row('openrouter:x', 'error', null), row('openrouter:x', 'error', null), row('openrouter:x', 'ok', 1000), row('openrouter:x', 'error', null)]
    const h = computeHealth(rows, { nowMs: NOW })
    expect(h.get('openrouter')!.verdict).toBe('down') // 1/4 = 0.25 < 0.5
  })

  it('p50 de latencia alto → slow', () => {
    const rows = [row('openrouter:x', 'ok', 25_000), row('openrouter:x', 'ok', 28_000), row('openrouter:x', 'ok', 30_000)]
    const h = computeHealth(rows, { nowMs: NOW })
    expect(h.get('openrouter')!.verdict).toBe('slow') // p50 28s > 20s
  })

  it('pocos intentos → no juzga (healthy)', () => {
    const rows = [row('openrouter:x', 'error', null), row('openrouter:x', 'error', null)] // 2 < minAttempts 3
    expect(computeHealth(rows, { nowMs: NOW }).get('openrouter')!.verdict).toBe('healthy')
  })

  it('ignora filas fuera de la ventana', () => {
    const rows = [row('openrouter:x', 'error', null, 200), row('openrouter:x', 'error', null, 200), row('openrouter:x', 'error', null, 200)]
    // 200 min atrás > ventana 120 min → no cuentan
    expect(computeHealth(rows, { nowMs: NOW }).size).toBe(0)
  })

  it('status ausente se asume ok (filas viejas)', () => {
    const rows: UsageRow[] = [
      { model: 'claude-sonnet-4-5', created_at: ago(5) },
      { model: 'claude-sonnet-4-5', created_at: ago(6) },
      { model: 'claude-sonnet-4-5', created_at: ago(7) },
    ]
    const h = computeHealth(rows, { nowMs: NOW })
    expect(h.get('anthropic')!.successRate).toBe(1)
    expect(h.get('anthropic')!.verdict).toBe('healthy')
  })

  it('degradedProviders devuelve lentos y caídos, no sanos', () => {
    const rows = [
      row('openrouter:x', 'ok', 28_000), row('openrouter:x', 'ok', 29_000), row('openrouter:x', 'ok', 30_000), // slow
      row('anthropic:c', 'ok', 1500), row('anthropic:c', 'ok', 1200), row('anthropic:c', 'ok', 1100), // healthy
    ]
    const deg = degradedProviders(computeHealth(rows, { nowMs: NOW }))
    expect(deg.has('openrouter')).toBe(true)
    expect(deg.has('anthropic')).toBe(false)
  })
})
