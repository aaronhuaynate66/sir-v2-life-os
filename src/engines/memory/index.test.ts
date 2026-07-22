// SIR V2 — Tests del Memory Engine (agregación de contexto).
//
// LIVE (/memoria vía buildMemoryContext). Agrega memorias: conteo por tipo,
// promedios, top (≥8), recientes (5) y entidades por frecuencia. Regression
// silencioso oculta o desordena memorias en el producto.

import { describe, it, expect } from 'vitest'

import type { Memory } from '@/types'
import { buildMemoryContext } from './index'

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
