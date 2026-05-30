// SIR V2 — Extractor deterministico de memorias desde relationships.history.
//
// Sesion 4 (Memorias asociadas, PR #1 backend).
//
// Toma un Person + su history (array de RelationshipEvent) y produce
// Memory[] sin llamar LLM. La logica es 100% deterministica para que el
// backfill sea reproducible: re-correrlo emite las mismas memorias y el
// unique index (user_id, source_event_id) las dedupea via ON CONFLICT
// DO NOTHING.
//
// REGLA DE EMISION (por event):
//
//   event.type === 'whatsapp_capture':
//     SIEMPRE: 1 Memory 'episodic' (resumen + topics + emotional charge).
//     SI emotionalStates es no-vacio: 1 Memory adicional 'emotional'.
//
//   Otros types (positive/negative/neutral/milestone) NO entran en scope
//   de este PR. PR #2 (sidebar UI) puede expandir mas adelante.
//
// IDs deterministicos:
//   - sourceEventId base = event.id || event.captureId
//   - Memory.id = `mem_${sourceEventId}_${suffix}` (suffix='ep' o 'em')
//   - Memory.sourceEventId = base para episodic, base+'_em' para emotional
//   El unique index DB es sobre (user_id, source_event_id) -> distinguibles.

import type { Memory, Person, RelationshipEvent } from '@/types'

const DEFAULT_IMPORTANCE = 5
const DEFAULT_DECAY_RATE = 0.05

function clampEmotionalCharge(n: number | undefined | null): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0
  return Math.max(-10, Math.min(10, n))
}

function hasEmotionalStates(event: RelationshipEvent): boolean {
  const es = event.emotionalStates
  if (!es) return false
  return Boolean(es.user) || Boolean(es.otherPerson)
}

/** Title corto y human-readable para una memoria episodic. Usa topics si
 *  hay, si no fecha + nombre. */
function buildEpisodicTitle(person: Person, event: RelationshipEvent): string {
  const topics = (event.topics ?? []).filter((t) => t && t.trim().length > 0)
  if (topics.length > 0) {
    return `Con ${person.name}: ${topics.slice(0, 3).join(', ')}`
  }
  return `Conversación con ${person.name}`
}

/** Title fijo para la emotional — el detalle va al content. */
function buildEmotionalTitle(person: Person): string {
  return `Estado emocional con ${person.name}`
}

function buildEmotionalContent(person: Person, event: RelationshipEvent): string {
  const es = event.emotionalStates
  if (!es) return ''
  const parts: string[] = []
  if (es.user) parts.push(`tú: ${es.user}`)
  if (es.otherPerson) parts.push(`${person.name}: ${es.otherPerson}`)
  return parts.join(' · ')
}

/**
 * Extrae memorias de un solo event whatsapp_capture. Devuelve [] si el
 * event no es del tipo soportado o no tiene id estable.
 */
function memoriesFromEvent(person: Person, event: RelationshipEvent): Memory[] {
  if (event.type !== 'whatsapp_capture') return []
  const sourceEventBase = event.id || event.captureId
  if (!sourceEventBase) return []

  const out: Memory[] = []
  const emotionalCharge = clampEmotionalCharge(event.emotionalTone)
  const baseTags = event.topics ?? []
  const entities = [person.id]
  const timestamp = event.date || new Date().toISOString()

  // 1. Episodic — siempre.
  out.push({
    id: `mem_${sourceEventBase}_ep`,
    type: 'episodic',
    title: buildEpisodicTitle(person, event),
    content: event.description || '(captura sin resumen)',
    entities,
    emotionalCharge,
    importance: DEFAULT_IMPORTANCE,
    timestamp,
    lastAccessed: timestamp,
    decayRate: DEFAULT_DECAY_RATE,
    tags: baseTags,
    relatedMemories: [],
    personId: person.id,
    source: 'whatsapp_capture',
    sourceEventId: sourceEventBase,
  })

  // 2. Emotional — solo si hay estado emocional reportado.
  if (hasEmotionalStates(event)) {
    out.push({
      id: `mem_${sourceEventBase}_em`,
      type: 'emotional',
      title: buildEmotionalTitle(person),
      content: buildEmotionalContent(person, event),
      entities,
      emotionalCharge,
      importance: DEFAULT_IMPORTANCE,
      timestamp,
      lastAccessed: timestamp,
      decayRate: DEFAULT_DECAY_RATE,
      tags: baseTags,
      relatedMemories: [],
      personId: person.id,
      source: 'whatsapp_capture',
      sourceEventId: `${sourceEventBase}_em`,
    })
  }

  return out
}

/**
 * Convierte un history completo en memorias. Determinista: misma entrada
 * -> misma salida (mismo id, sourceEventId).
 */
export function extractMemoriesFromHistory(
  person: Person,
  history: RelationshipEvent[],
): Memory[] {
  if (!Array.isArray(history) || history.length === 0) return []
  const out: Memory[] = []
  for (const event of history) {
    out.push(...memoriesFromEvent(person, event))
  }
  return out
}

// ─── Backfill server-side ───────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Convierte una Memory en row para INSERT. Idempotente con el unique
 * partial index (user_id, source_event_id) cuando lo hay.
 *
 * Nota: occurred_at es la columna DB; Memory.timestamp es el alias TS.
 * last_accessed default es Memory.timestamp si la memoria es nueva.
 */
function memoryToRow(m: Memory, userId: string): Record<string, unknown> {
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
    source: m.source ?? null,
    source_event_id: m.sourceEventId ?? null,
  }
}

export interface BackfillResult {
  /** Memorias derivadas del history (antes de dedupe). */
  generated: number
  /** Memorias efectivamente insertadas (excluye dedupe). */
  inserted: number
  /** Memorias rechazadas por ON CONFLICT DO NOTHING (ya existian). */
  skipped: number
}

/**
 * Materializa las memorias derivadas del history de una persona en la
 * tabla `memories`. Idempotente: re-correr no duplica (el unique partial
 * index sobre (user_id, source_event_id) hace ON CONFLICT DO NOTHING).
 *
 * Server-side: pasar un SupabaseClient autenticado (server cookies o
 * service role). RLS deja pasar solo rows del user del context.
 *
 * Pre-condicion: migration 0012 aplicada (columna source_event_id +
 * unique index). Si no esta, supabase-js .upsert con onConflict tira
 * 42P10 ("there is no unique or exclusion constraint matching"). El
 * PR #1 no llama esta funcion desde ningun handler aun — la deja lista
 * para PR #2.
 */
export async function backfillMemoriesForPerson(
  supabase: SupabaseClient,
  userId: string,
  person: Person,
  history: RelationshipEvent[],
): Promise<BackfillResult> {
  const memories = extractMemoriesFromHistory(person, history)
  if (memories.length === 0) {
    return { generated: 0, inserted: 0, skipped: 0 }
  }
  const rows = memories.map((m) => memoryToRow(m, userId))

  // .upsert con ignoreDuplicates=true -> ON CONFLICT DO NOTHING.
  // Devuelve solo las rows efectivamente insertadas (las skipped no
  // vuelven al cliente).
  const { data, error } = await supabase
    .from('memories')
    .upsert(rows, {
      onConflict: 'user_id,source_event_id',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) {
    throw new Error(`backfill memories falló: ${error.message}`)
  }
  const inserted = data?.length ?? 0
  return {
    generated: memories.length,
    inserted,
    skipped: memories.length - inserted,
  }
}
