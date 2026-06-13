// SIR V2 — Materializar una interacción registrada a mano como `memory`.
//
// PROBLEMA QUE RESUELVE: el briefing de persona y la IA leen SÓLO la tabla
// `memories` (getMemoriesForPerson). Una "interacción" registrada a mano vive
// en `person_logs` (kind='interaction', value=tono 1-5, note=texto) — un cajón
// distinto que el briefing nunca toca. Resultado: el usuario escribe una nota
// real y rica y el briefing responde "no hay nada que resumir".
//
// SOLUCIÓN (camino ADITIVO, mismo espíritu que deriveFromObservations): cuando
// se registra una interacción CON nota, materializamos esa nota como una
// memoria episódica. NO tocamos el flujo de derivación de observations.
//
// IDEMPOTENCIA ANCLADA EN EL PK: el id de la memoria es determinístico a
// partir del id del person_log:
//   id = `mem_log:<logId>`
// El PK `memories.id` SIEMPRE existe → upsert con ON CONFLICT (id) DO NOTHING.
// Re-registrar/re-correr no duplica.

import type { Memory } from '@/types'

/** Prefijo del id determinístico de una memoria materializada desde un log. */
export const INTERACTION_MEMORY_PREFIX = 'mem_log'

/** Id determinístico de la memoria que materializa un person_log. */
export function interactionLogMemoryId(logId: string): string {
  return `${INTERACTION_MEMORY_PREFIX}:${logId}`
}

/** ¿Este log debe materializarse como memoria? Sólo interacciones con nota
 *  real (texto no vacío). Los registros numéricos (mood/energy/sleep/pain) NO
 *  son material narrativo y no se materializan. */
export function shouldMaterializeInteraction(
  kind: string,
  note: string | null | undefined,
): boolean {
  return kind === 'interaction' && typeof note === 'string' && note.trim().length > 0
}

/** Tono 1-5 → carga emocional [-1, 1]. 3 = neutral, 1 = muy negativo (-1),
 *  5 = muy positivo (+1). Preserva el "corazón roto 1/5" como señal afectiva
 *  de la memoria sin inventar nada. */
export function toneToCharge(value: number): number {
  if (!Number.isFinite(value)) return 0
  const clamped = Math.min(5, Math.max(1, value))
  return (clamped - 3) / 2
}

export interface InteractionLogLite {
  id: string
  personId: string
  note: string
  /** Tono 1-5. */
  value: number
  /** ISO. "cuándo pasó". */
  loggedAt: string
}

/** Construye la Memory (camelCase) que representa la interacción registrada. */
export function interactionLogToMemory(log: InteractionLogLite): Memory {
  const ts = log.loggedAt
  return {
    id: interactionLogMemoryId(log.id),
    type: 'episodic',
    title: 'Interacción registrada',
    content: log.note.trim(),
    entities: log.personId ? [log.personId] : [],
    emotionalCharge: toneToCharge(log.value),
    importance: 6, // la registró a mano: importa más que el default (5).
    timestamp: ts,
    lastAccessed: ts,
    decayRate: 0.05,
    tags: ['interaccion'],
    relatedMemories: [],
    personId: log.personId,
    source: 'manual',
  }
}

/** Row snake_case listo para upsert en `memories` (ON CONFLICT id). NO setea
 *  observation_id (esta memoria no nace de una observation). */
export function interactionLogToMemoryRow(
  log: InteractionLogLite,
  userId: string,
): Record<string, unknown> {
  const m = interactionLogToMemory(log)
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
    source: m.source ?? 'manual',
  }
}
