// SIR V2 — Tests del Memory Engine (query / decay / agregación).
//
// LIVE (7 páginas). queryMemories (multi-filtro + sort + limit),
// decayMemories (fórmula de olvido con override de importancia, fechas →
// fake timers), getRelatedMemories (por id o entidad compartida),
// buildMemoryContext (agregaciones + top/recent/entidades). Regression
// silencioso oculta o desordena memorias en todo el producto.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import type { Memory } from '@/types'
import { queryMemories, getRelatedMemories, decayMemories, buildMemoryContext } from './index'

let n = 0
function mem(o: Partial<Memory> = {}): Memory {
  return {
    id: `m_${n++}`,
    type: 'episodic',
    title: 't',
    content: 'c',
    entities: [],
    emotionalCharge: 0,
    importance: 5,
    timestamp: '2026-01-01T00:00:00.000Z',
    lastAccessed: '2026-01-01T00:00:00.000Z',
    decayRate: 0.05,
    tags: [],
    relatedMemories: [],
    ...o,
  }
}

describe('queryMemories', () => {
  it('filtra por tipo, importancia mínima y ordena por importancia desc', () => {
    const out = queryMemories(
      [mem({ id: 'a', type: 'episodic', importance: 3 }), mem({ id: 'b', type: 'episodic', importance: 9 }), mem({ id: 'c', type: 'semantic', importance: 10 })],
      { type: 'episodic', minImportance: 5 },
    )
    expect(out.map((m) => m.id)).toEqual(['b']) // c es semantic, a importancia<5
  })

  it('filtra por entidades y tags (OR dentro de cada lista)', () => {
    const out = queryMemories(
      [mem({ id: 'x', entities: ['p1'] }), mem({ id: 'y', entities: ['p2'] }), mem({ id: 'z', entities: [] })],
      { entities: ['p1', 'p2'] },
    )
    expect(out.map((m) => m.id).sort()).toEqual(['x', 'y'])
  })

  it('aplica limit tras ordenar', () => {
    const out = queryMemories(
      [mem({ id: 'lo', importance: 1 }), mem({ id: 'hi', importance: 10 }), mem({ id: 'mid', importance: 5 })],
      { limit: 2 },
    )
    expect(out.map((m) => m.id)).toEqual(['hi', 'mid'])
  })

  it('sin filtros → copia ordenada, NO muta el input', () => {
    const input = [mem({ id: 'a', importance: 1 }), mem({ id: 'b', importance: 9 })]
    const snapshot = input.map((m) => m.id)
    const out = queryMemories(input, {})
    expect(out.map((m) => m.id)).toEqual(['b', 'a'])
    expect(input.map((m) => m.id)).toEqual(snapshot)
  })
})

describe('getRelatedMemories', () => {
  it('relaciona por id explícito o entidad compartida, excluye la propia', () => {
    const base = mem({ id: 'base', entities: ['ana'], relatedMemories: ['rel1'] })
    const all = [
      base,
      mem({ id: 'rel1', entities: [] }), // por id explícito
      mem({ id: 'shared', entities: ['ana'] }), // por entidad compartida
      mem({ id: 'unrelated', entities: ['otro'] }),
    ]
    expect(getRelatedMemories(base, all).map((m) => m.id).sort()).toEqual(['rel1', 'shared'])
  })
})

describe('decayMemories', () => {
  const NOW = new Date('2026-06-01T00:00:00.000Z')
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })

  it('memoria reciente sobrevive; muy vieja se olvida', () => {
    const recent = mem({ id: 'recent', timestamp: '2026-05-01T00:00:00.000Z', importance: 5, decayRate: 0.05 })
    // ventana = (1-0.05)*365 ≈ 346 días. 2 años atrás supera la ventana.
    const ancient = mem({ id: 'ancient', timestamp: '2024-01-01T00:00:00.000Z', importance: 5, decayRate: 0.05 })
    const out = decayMemories([recent, ancient])
    expect(out.map((m) => m.id)).toEqual(['recent'])
  })

  it('importancia ≥ 8 sobrevive aunque exceda la ventana de decay', () => {
    const ancientImportant = mem({ id: 'keep', timestamp: '2020-01-01T00:00:00.000Z', importance: 9, decayRate: 0.05 })
    expect(decayMemories([ancientImportant]).map((m) => m.id)).toEqual(['keep'])
  })

  it('decayRate alto acorta la ventana de retención', () => {
    // decayRate 0.9 → ventana = 0.1*365 ≈ 36 días. 60 días atrás se olvida.
    const m60 = mem({ id: 'm60', timestamp: '2026-04-02T00:00:00.000Z', importance: 5, decayRate: 0.9 })
    expect(decayMemories([m60])).toHaveLength(0)
  })
})

describe('buildMemoryContext', () => {
  it('vacío → ceros y estructuras vacías', () => {
    const ctx = buildMemoryContext([])
    expect(ctx.totalMemories).toBe(0)
    expect(ctx.averageImportance).toBe(0)
    expect(ctx.topMemories).toEqual([])
    expect(ctx.criticalEntities).toEqual([])
    expect(ctx.memoriesByType.episodic).toBe(0)
  })

  it('cuenta por tipo, promedia, top (≥8) y entidades por frecuencia', () => {
    const ctx = buildMemoryContext([
      mem({ type: 'episodic', importance: 10, emotionalCharge: 2, entities: ['ana', 'beto'] }),
      mem({ type: 'episodic', importance: 4, emotionalCharge: -2, entities: ['ana'] }),
      mem({ type: 'emotional', importance: 8, emotionalCharge: 0, entities: ['ana'] }),
    ])
    expect(ctx.totalMemories).toBe(3)
    expect(ctx.memoriesByType.episodic).toBe(2)
    expect(ctx.memoriesByType.emotional).toBe(1)
    expect(ctx.averageImportance).toBeCloseTo((10 + 4 + 8) / 3, 5)
    expect(ctx.averageEmotionalCharge).toBeCloseTo(0, 5)
    expect(ctx.topMemories).toHaveLength(2) // importancia 10 y 8
    expect(ctx.topMemories[0].importance).toBe(10) // ordenado desc
    expect(ctx.criticalEntities[0]).toEqual({ entityId: 'ana', count: 3 }) // ana en las 3
  })

  it('recentMemories ordena por timestamp desc y limita a 5', () => {
    const memories = Array.from({ length: 7 }, (_, i) =>
      mem({ id: `d${i}`, timestamp: `2026-01-0${i + 1}T00:00:00.000Z` }),
    )
    const ctx = buildMemoryContext(memories)
    expect(ctx.recentMemories).toHaveLength(5)
    expect(ctx.recentMemories[0].id).toBe('d6') // 2026-01-07 es el más nuevo
  })
})
