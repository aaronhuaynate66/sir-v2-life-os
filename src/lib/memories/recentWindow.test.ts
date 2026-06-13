import { describe, it, expect } from 'vitest'
import { recentWindowContent, recentWindowMemoryId, recentWindowMemory, recentWindowMemoryRow } from './recentWindow'

describe('recentWindowContent', () => {
  it('toma los últimos 2 bloques (más recientes)', () => {
    const r = recentWindowContent(['b1 viejo', 'b2 medio', 'b3 reciente'], 'resumen')
    expect(r).toBe('b2 medio b3 reciente')
  })
  it('cae al resumen si no hay bloques', () => {
    expect(recentWindowContent([], 'resumen recency-first')).toBe('resumen recency-first')
    expect(recentWindowContent(null, 'fb')).toBe('fb')
  })
  it('null si no hay nada', () => {
    expect(recentWindowContent([], '')).toBeNull()
    expect(recentWindowContent(null, null)).toBeNull()
  })
})

describe('recentWindowMemory / Row', () => {
  const inp = { observationId: 'obs-1', personId: 'p-1', content: '  charla de ayer  ', occurredAt: '2026-06-13T10:00:00Z' }
  it('id determinístico + episódica reciente', () => {
    expect(recentWindowMemoryId('obs-1')).toBe('mem_recent:obs-1')
    const m = recentWindowMemory(inp)
    expect(m.id).toBe('mem_recent:obs-1')
    expect(m.type).toBe('episodic')
    expect(m.importance).toBe(7)
    expect(m.content).toBe('charla de ayer')
    expect(m.timestamp).toBe(inp.occurredAt)
  })
  it('row mapea snake_case con observation_id', () => {
    const row = recentWindowMemoryRow(inp, 'u1')
    expect(row.id).toBe('mem_recent:obs-1')
    expect(row.user_id).toBe('u1')
    expect(row.occurred_at).toBe(inp.occurredAt)
    expect(row.observation_id).toBe('obs-1')
  })
})
