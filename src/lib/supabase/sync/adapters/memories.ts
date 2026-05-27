// SIR V2 — Memory table adapter (Sesión 20c)

import type { Memory } from '@/types'
import type { TableAdapter } from '../types'

export const memoryAdapter: TableAdapter<Memory> = {
  table: 'memories',
  toRow: (m, userId) => ({
    id: m.id,
    user_id: userId,
    type: m.type,
    title: m.title,
    content: m.content,
    entities: m.entities,
    emotional_charge: m.emotionalCharge,
    importance: m.importance,
    decay_rate: m.decayRate,
    tags: m.tags,
    related_memories: m.relatedMemories ?? [],
    occurred_at: m.timestamp,
    last_accessed: m.lastAccessed ?? m.timestamp,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    type: row.type as Memory['type'],
    title: row.title as string,
    content: row.content as string,
    entities: (row.entities as string[]) ?? [],
    emotionalCharge: Number(row.emotional_charge) || 0,
    importance: Number(row.importance) || 5,
    decayRate: Number(row.decay_rate) || 0.05,
    tags: (row.tags as string[]) ?? [],
    relatedMemories: (row.related_memories as string[]) ?? [],
    timestamp: row.occurred_at as string,
    lastAccessed: (row.last_accessed as string) ?? (row.occurred_at as string),
  }),
}
