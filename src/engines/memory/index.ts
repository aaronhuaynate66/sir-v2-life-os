// SIR V2 — Memory Engine
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
  return all.filter(m => m.id !== memory.id && (memory.relatedMemories.includes(m.id) || m.entities.some(e => memory.entities.includes(e)) || m.tags.some(t => memory.tags.includes(t)))).slice(0, 5)
}

export function decayMemories(memories: Memory[]): Memory[] {
  const now = Date.now()
  return memories.filter(m => (now - new Date(m.timestamp).getTime()) / 86400000 < (1 - m.decayRate) * 365 || m.importance >= 8)
}
