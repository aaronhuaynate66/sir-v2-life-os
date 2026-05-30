// SIR V2 - Memory Engine
import type { Memory, MemoryType } from '@/types'

export interface MemoryQuery { type?: MemoryType; entities?: string[]; tags?: string[]; minImportance?: number; limit?: number }

export function queryMemories(memories: Memory[], query: MemoryQuery): Memory[] {
  let r = [...memories]
  if (query.type) r = r.filter(m => m.type === query.type)
  if (query.entities?.length) r = r.filter(m => query.entities!.some(e => m.entities.includes(e)))
  if (query.tags?.length) r = r.filter(m => query.tags!.some(t => m.tags.includes(t)))
  if (query.minImportance !== undefined) r = r.filter(m => m.importance >= query.minImportance!)
  r.sort((a, b) => b.importance - a.importance)
  return query.limit ? r.slice(0, query.limit) : r
}

export function createMemory(data: Omit<Memory, 'id' | 'lastAccessed'>): Memory {
  return { ...data, id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, lastAccessed: new Date().toISOString() }
}

export function getRelatedMemories(memory: Memory, all: Memory[]): Memory[] {
  return all.filter(m => m.id !== memory.id && (memory.relatedMemories.includes(m.id) || m.entities.some(e => memory.entities.includes(e))))
}

export function decayMemories(memories: Memory[]): Memory[] {
  const now = Date.now()
  return memories.filter(m => (now - new Date(m.timestamp).getTime()) / 86400000 < (1 - m.decayRate) * 365 || m.importance >= 8)
}

export type MemoryContext = {
  totalMemories: number
  memoriesByType: Record<MemoryType, number>
  averageImportance: number
  averageEmotionalCharge: number
  topMemories: Memory[]
  recentMemories: Memory[]
  criticalEntities: Array<{ entityId: string; count: number }>
}

export function buildMemoryContext(memories: Memory[]): MemoryContext {
  if (memories.length === 0) {
    const emptyByType: Record<MemoryType, number> = {
      episodic: 0,
      semantic: 0,
      emotional: 0,
      relational: 0,
      temporal: 0,
      predictive: 0,
      social: 0,
    }
    return {
      totalMemories: 0,
      memoriesByType: emptyByType,
      averageImportance: 0,
      averageEmotionalCharge: 0,
      topMemories: [],
      recentMemories: [],
      criticalEntities: [],
    }
  }

  const memoriesByType: Record<MemoryType, number> = {
    episodic: 0,
    semantic: 0,
    emotional: 0,
    relational: 0,
    temporal: 0,
    predictive: 0,
    social: 0,
  }
  for (const m of memories) {
    memoriesByType[m.type] = (memoriesByType[m.type] ?? 0) + 1
  }

  const totalMemories = memories.length
  const averageImportance = memories.reduce((sum, m) => sum + m.importance, 0) / totalMemories
  const averageEmotionalCharge = memories.reduce((sum, m) => sum + m.emotionalCharge, 0) / totalMemories

  const topMemories = [...memories]
    .filter(m => m.importance >= 8)
    .sort((a, b) => b.importance - a.importance)

  const recentMemories = [...memories]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5)

  const entityCountMap = new Map<string, number>()
  for (const m of memories) {
    for (const e of m.entities) {
      entityCountMap.set(e, (entityCountMap.get(e) ?? 0) + 1)
    }
  }
  const criticalEntities = Array.from(entityCountMap.entries())
    .map(([entityId, count]) => ({ entityId, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalMemories,
    memoriesByType,
    averageImportance,
    averageEmotionalCharge,
    topMemories,
    recentMemories,
    criticalEntities,
  }
}

export * from './events'
