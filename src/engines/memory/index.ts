// SIR V2 - Memory Engine
import type { Memory, MemoryType } from '@/types'

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
