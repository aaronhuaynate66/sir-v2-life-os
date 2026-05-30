// SIR V2 — Memory → TimelineEvent adapter
import type { Memory } from '@/types'
import type { TimelineEvent } from '../types'

const TYPE_LABEL: Record<Memory['type'], string> = {
  episodic: 'Episódica',
  semantic: 'Semántica',
  emotional: 'Emocional',
  relational: 'Relacional',
  temporal: 'Temporal',
  predictive: 'Predictiva',
  social: 'Social',
}

export function adaptMemory(m: Memory): TimelineEvent {
  return {
    id: `memory:${m.id}`,
    type: 'memory',
    occurredAt: m.timestamp,
    title: m.title,
    body: m.content.length > 200 ? `${m.content.slice(0, 197)}...` : m.content,
    tags: [TYPE_LABEL[m.type], ...m.tags.slice(0, 3)],
    meta: {
      memoryType: m.type,
      importance: m.importance,
      emotionalCharge: m.emotionalCharge,
      entities: m.entities,
    },
  }
}

export function adaptMemories(rows: Memory[]): TimelineEvent[] {
  return rows.map(adaptMemory)
}
