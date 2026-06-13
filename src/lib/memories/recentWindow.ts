// SIR V2 — Memoria de "ventana reciente" desde un export de WhatsApp.
//
// PROBLEMA: el export se consolida en UNA observación con resumen recency-first,
// y las memorias derivadas quedan con contenido/fechas viejas. El briefing
// entonces narra el vínculo por su promedio histórico ("se vieron hace once
// días") aunque el contacto sea de ayer.
//
// SOLUCIÓN: además de la observación, materializamos UNA memoria episódica con
// el contenido MÁS RECIENTE del chat (los últimos bloques) y fecha = último
// mensaje. Como getMemoriesForPerson ordena por occurred_at DESC, esta memoria
// encabeza la lista → el briefing lee lo último, con textura, no el promedio.
//
// PURO. Idempotente vía id determinístico mem_recent:<observationId>.

import type { Memory } from '@/types'

const MAX_RECENT_BLOCKS = 2
const MAX_CONTENT = 700

/** Contenido de la ventana reciente: los últimos bloques (más recientes) del
 *  export. Cae al head del resumen recency-first si no hay bloques. null si no
 *  hay nada usable. */
export function recentWindowContent(
  blockSummaries: string[] | null | undefined,
  fallbackSummary: string | null | undefined,
): string | null {
  const blocks = (blockSummaries ?? []).filter((b) => typeof b === 'string' && b.trim().length > 0)
  if (blocks.length > 0) {
    const recent = blocks.slice(-MAX_RECENT_BLOCKS).map((b) => b.trim())
    const joined = recent.join(' ')
    return joined.slice(0, MAX_CONTENT)
  }
  const fb = (fallbackSummary ?? '').trim()
  if (fb.length > 0) return fb.slice(0, MAX_CONTENT)
  return null
}

/** Id determinístico de la memoria de ventana reciente de una observación. */
export function recentWindowMemoryId(observationId: string): string {
  return `mem_recent:${observationId}`
}

export interface RecentWindowInput {
  observationId: string
  personId: string
  content: string
  /** ISO del último mensaje → recencia real. */
  occurredAt: string
}

/** Memory (camelCase) de la ventana reciente. Episódica, importancia alta
 *  (es lo más fresco), fecha = último mensaje. */
export function recentWindowMemory(input: RecentWindowInput): Memory {
  const ts = input.occurredAt
  return {
    id: recentWindowMemoryId(input.observationId),
    type: 'episodic',
    title: 'Conversación reciente (WhatsApp)',
    content: input.content.trim(),
    entities: input.personId ? [input.personId] : [],
    emotionalCharge: 0,
    importance: 7,
    timestamp: ts,
    lastAccessed: ts,
    decayRate: 0.05,
    tags: ['whatsapp', 'reciente'],
    relatedMemories: [],
    personId: input.personId,
    source: 'inferred',
  }
}

/** Row snake_case para upsert en memories (ON CONFLICT id). */
export function recentWindowMemoryRow(input: RecentWindowInput, userId: string): Record<string, unknown> {
  const m = recentWindowMemory(input)
  return {
    id: m.id,
    user_id: userId,
    person_id: m.personId ?? null,
    type: m.type,
    title: m.title,
    content: m.content,
    entities: m.entities ?? [],
    emotional_charge: m.emotionalCharge,
    importance: m.importance,
    decay_rate: m.decayRate,
    tags: m.tags ?? [],
    related_memories: m.relatedMemories ?? [],
    occurred_at: m.timestamp,
    last_accessed: m.lastAccessed ?? m.timestamp,
    source: m.source ?? 'inferred',
    observation_id: input.observationId,
  }
}
