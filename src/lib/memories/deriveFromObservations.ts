// SIR V2 — Derivar memorias desde `observations` (camino ADITIVO).
//
// Contexto: las capturas reales escriben `observations`, no `memories`, así
// que /memoria y /buscar quedan "hambrientos". Este módulo materializa
// memorias en la tabla `memories` a partir de observations curadas, SIN
// tocar el flujo viejo (relationships.history / backfill 0012 siguen vivos).
//
// IDEMPOTENCIA ANCLADA EN EL PRIMARY KEY:
//   El id de cada memoria derivada es determinístico:
//     id = `mem_obs:<observationId>:<n>`
//   El PK `memories.id` SIEMPRE existe (0001) → re-derivar hace upsert con
//   ON CONFLICT (id) DO NOTHING, sin depender de columnas opcionales.
//
//   (Decisión post-bug 31/05: la versión previa anclaba en
//   source_event_id, columna de la migration 0012 que NUNCA se aplicó en
//   prod. El PK es la única clave garantizada. `observation_id` —de 0010—
//   se setea igual, para linkear y para el skip pre-LLM.)
//
// SÍNTESIS: el route usa Anthropic (ver derivePrompt.ts). Este módulo provee
// el armado determinístico (clave estable, selección de no-cubiertas, mapeo
// observation→memoria base y mapeo de los items del LLM a Memory). Todo lo
// puro vive acá y es testeable; el efecto de red queda en el route.

import type { Memory } from '@/types'
import type { CaptureType, Observation } from '@/lib/capture/observations/types'

/** Tipos de observation que califican para derivar memorias. Conversaciones
 *  (las más ricas) + perfiles sociales/profesionales + notas. */
export const QUALIFYING_CAPTURE_TYPES: readonly CaptureType[] = [
  'whatsapp_chat',
  'whatsapp_web',
  'instagram',
  'linkedin',
  'manual_note',
  'voice_note',
]

/** Tipo de memoria base por captura (fallback determinístico). */
const BASE_MEMORY_TYPE: Partial<Record<CaptureType, Memory['type']>> = {
  whatsapp_chat: 'episodic',
  whatsapp_web: 'episodic',
  instagram: 'social',
  linkedin: 'semantic',
  manual_note: 'semantic',
  voice_note: 'episodic',
}

/** Tipos de memoria que aceptamos de la síntesis LLM (subset seguro). */
export const ALLOWED_DERIVED_TYPES: readonly Memory['type'][] = [
  'episodic',
  'semantic',
  'emotional',
  'social',
]

const SOURCE_PREFIX = 'obs'
const DEFAULT_IMPORTANCE = 5
const DEFAULT_DECAY_RATE = 0.05
const MAX_MEMORIES_PER_OBSERVATION = 2

// ─── Clave estable / idempotencia ───────────────────────────────────

/** Clave estable de una memoria derivada: `obs:<observationId>:<n>`. */
export function deriveKey(observationId: string, index: number): string {
  return `${SOURCE_PREFIX}:${observationId}:${index}`
}

/** Parsea una clave derivada. null si no es del namespace 'obs:'. */
export function parseDerivedKey(
  key: string | null | undefined,
): { observationId: string; index: number } | null {
  if (!key) return null
  const m = key.match(/^obs:(.+):(\d+)$/)
  if (!m) return null
  return { observationId: m[1], index: Number(m[2]) }
}

/** Primary key determinístico de una memoria derivada: `mem_obs:<id>:<n>`.
 *  Es la ANCLA de idempotencia (upsert ON CONFLICT (id) DO NOTHING). */
export function derivedMemoryId(observationId: string, index: number): string {
  return `mem_${deriveKey(observationId, index)}`
}

/** Inverso de derivedMemoryId: extrae el observationId de un PK derivado.
 *  null si el id no es del namespace derivado. */
export function observationIdFromMemoryId(memId: string | null | undefined): string | null {
  if (!memId || !memId.startsWith('mem_')) return null
  return parseDerivedKey(memId.slice(4))?.observationId ?? null
}

/** Observations que todavía NO fueron derivadas (idempotencia barata antes
 *  de llamar al LLM). */
export function selectUncoveredObservations(
  observations: Observation[],
  covered: Set<string>,
): Observation[] {
  return observations.filter((o) => !covered.has(o.id))
}

/**
 * Observations que SON fuente legítima para derivar memorias.
 *
 * Raíz del bug LinkedIn propagado a memorias: una captura ilegible (página
 * entera, letra diminuta) salió con confianza baja y campos garabateados, y
 * "Derivar desde mis conversaciones" la usó igual → 2 memorias basura.
 *
 * Excluimos:
 *   - obsoletas/descartadas (`isObsolete`) — ya las filtra el fetch, pero lo
 *     repetimos acá para que la función pura sea self-contained y testeable.
 *   - confianza baja o media — fuente dudosa; no queremos materializar basura.
 *
 * Mantenemos confianza 'high' y `null` (legacy: capturas pre-confidence que
 * no tienen el campo; no las castigamos retroactivamente).
 */
export function selectDerivableObservations(observations: Observation[]): Observation[] {
  return observations.filter((o) => {
    if (o.isObsolete) return false
    if (o.confidence === 'low' || o.confidence === 'medium') return false
    return true
  })
}

// ─── Lectura defensiva de `data` (Record<string, unknown>) ──────────

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/** Mejor texto humano disponible de una observation (para prompt + base). */
export function extractObservationText(obs: Observation): string | null {
  const d = obs.data ?? {}
  // Orden de preferencia por riqueza semántica.
  return (
    str(d.summary) ??
    str(d.about) ??
    str(d.bio) ??
    str(d.headline) ??
    str(d.text) ??
    str(d.note) ??
    str(d.content) ??
    str(d.caption) ??
    null
  )
}

/** Topics/tags de una observation, si los hay. */
export function extractTopics(obs: Observation): string[] {
  const d = obs.data ?? {}
  const raw = Array.isArray(d.topics) ? d.topics : Array.isArray(d.tags) ? d.tags : []
  return raw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
}

function extractEmotionalStates(obs: Observation): { user: string | null; other: string | null } {
  const emo = (obs.data?.emotionalStates ?? {}) as Record<string, unknown>
  return { user: str(emo.user), other: str(emo.otherPerson) }
}

export interface ObservationDigest {
  index: number
  observationId: string
  captureType: CaptureType
  observedAt: string
  text: string | null
  topics: string[]
  emotionalUser: string | null
  emotionalOther: string | null
}

/** Resumen compacto de una observation para el prompt del LLM (indexado). */
export function digestObservations(observations: Observation[]): ObservationDigest[] {
  return observations.map((o, index) => {
    const emo = extractEmotionalStates(o)
    return {
      index,
      observationId: o.id,
      captureType: o.captureType,
      observedAt: o.observedAt,
      text: extractObservationText(o),
      topics: extractTopics(o),
      emotionalUser: emo.user,
      emotionalOther: emo.other,
    }
  })
}

// ─── Memoria base determinística (fallback sin LLM) ─────────────────

function clampCharge(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  return Math.max(-10, Math.min(10, v))
}

function clampImportance(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : DEFAULT_IMPORTANCE
  return Math.max(1, Math.min(10, v))
}

const CAPTURE_LABEL: Partial<Record<CaptureType, string>> = {
  whatsapp_chat: 'conversación de WhatsApp',
  whatsapp_web: 'conversación de WhatsApp',
  instagram: 'perfil de Instagram',
  linkedin: 'perfil de LinkedIn',
  manual_note: 'nota',
  voice_note: 'nota de voz',
}

/**
 * Memoria base determinística para UNA observation (fallback cuando el LLM
 * no está disponible o no devolvió nada parseable). Siempre 1 memoria.
 */
export function baseMemoryFromObservation(personName: string, obs: Observation): Memory {
  const type = BASE_MEMORY_TYPE[obs.captureType] ?? 'semantic'
  const text = extractObservationText(obs)
  const topics = extractTopics(obs)
  const label = CAPTURE_LABEL[obs.captureType] ?? 'interacción'
  const content =
    text ??
    (topics.length > 0
      ? `${label} con ${personName}: ${topics.slice(0, 4).join(', ')}.`
      : `${label} con ${personName}.`)
  const title =
    topics.length > 0
      ? `Con ${personName}: ${topics.slice(0, 3).join(', ')}`
      : `Con ${personName} — ${label}`
  const emo = extractEmotionalStates(obs)
  const timestamp = obs.observedAt || obs.capturedAt || obs.createdAt

  return {
    id: derivedMemoryId(obs.id, 0),
    type,
    title,
    content,
    entities: obs.personId ? [obs.personId] : [],
    emotionalCharge: 0,
    importance: DEFAULT_IMPORTANCE,
    timestamp,
    lastAccessed: timestamp,
    decayRate: DEFAULT_DECAY_RATE,
    tags: topics,
    relatedMemories: [],
    personId: obs.personId ?? undefined,
    source: 'inferred',
    // sourceEventId es el CARRIER en memoria de la clave (para derivar el
    // PK id y la columna observation_id). NO se persiste en una columna
    // source_event_id (esa es de 0012, que puede no existir en prod).
    sourceEventId: deriveKey(obs.id, 0),
  }
}

export function baseMemoriesFromObservations(
  personName: string,
  observations: Observation[],
): Memory[] {
  return observations.map((o) => baseMemoryFromObservation(personName, o))
}

// ─── Mapeo de items del LLM → Memory ────────────────────────────────

/** Item crudo que esperamos del LLM (validado defensivamente). */
export interface DerivedMemoryItem {
  observationIndex: number
  type?: string
  title?: string
  content?: string
  emotionalCharge?: number
  importance?: number
  tags?: string[]
}

/**
 * Mapea items del LLM a Memory[] con claves estables por observation. Los
 * items inválidos (índice fuera de rango, sin content, tipo no permitido)
 * se descartan. Se respeta un máximo por observation y se enumeran 0..n-1
 * para construir claves únicas.
 */
export function memoriesFromLlmItems(
  personName: string,
  observations: Observation[],
  items: DerivedMemoryItem[],
): Memory[] {
  const out: Memory[] = []
  const perObsCount = new Map<string, number>()

  for (const item of items) {
    const idx = item.observationIndex
    if (!Number.isInteger(idx) || idx < 0 || idx >= observations.length) continue
    const obs = observations[idx]

    const content = str(item.content)
    if (!content) continue

    const used = perObsCount.get(obs.id) ?? 0
    if (used >= MAX_MEMORIES_PER_OBSERVATION) continue

    const type =
      typeof item.type === 'string' &&
      (ALLOWED_DERIVED_TYPES as string[]).includes(item.type)
        ? (item.type as Memory['type'])
        : (BASE_MEMORY_TYPE[obs.captureType] ?? 'semantic')

    const title = str(item.title) ?? `Con ${personName}`
    const tags = Array.isArray(item.tags)
      ? item.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 8)
      : extractTopics(obs)
    const timestamp = obs.observedAt || obs.capturedAt || obs.createdAt
    const key = deriveKey(obs.id, used)

    out.push({
      id: derivedMemoryId(obs.id, used),
      type,
      title,
      content,
      entities: obs.personId ? [obs.personId] : [],
      emotionalCharge: clampCharge(item.emotionalCharge),
      importance: clampImportance(item.importance),
      timestamp,
      lastAccessed: timestamp,
      decayRate: DEFAULT_DECAY_RATE,
      tags,
      relatedMemories: [],
      personId: obs.personId ?? undefined,
      source: 'inferred',
      sourceEventId: key,
    })
    perObsCount.set(obs.id, used + 1)
  }

  return out
}

// ─── Row builder para INSERT ─────────────────────────────────────────
//
// NO escribe source_event_id (columna de 0012, ausente en prod). El PK
// `id` (determinístico) es la clave de idempotencia. observation_id (0010)
// se infiere de la clave en memoria para linkear y para el skip pre-LLM.

export function derivedMemoryToRow(m: Memory, userId: string): Record<string, unknown> {
  const observationId =
    observationIdFromMemoryId(m.id) ?? parseDerivedKey(m.sourceEventId)?.observationId ?? null
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
    observation_id: observationId,
  }
}
