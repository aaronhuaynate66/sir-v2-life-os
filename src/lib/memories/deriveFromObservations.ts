// SIR V2 — Derivar memorias desde `observations` (camino ADITIVO).
//
// Contexto: las capturas reales escriben `observations`, no `memories`, así
// que /memoria y /buscar quedan "hambrientos". Este módulo materializa
// memorias en la tabla `memories` a partir de observations curadas, SIN
// tocar el flujo viejo (relationships.history / backfill 0012 siguen vivos).
//
// IDEMPOTENCIA SIN MIGRACIÓN: reusamos el unique index parcial existente
// (user_id, source_event_id). La clave estable por memoria es
//   `obs:<observationId>:<n>`
// (prefijo 'obs:' → nunca colisiona con las del backfill viejo, que usan
// ids de RelationshipEvent). Re-derivar hace ON CONFLICT DO NOTHING.
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

/** Ids de observation ya cubiertos a partir de las claves source_event_id
 *  existentes (las que no son del namespace 'obs:' se ignoran). */
export function coveredObservationIds(sourceEventIds: (string | null | undefined)[]): Set<string> {
  const set = new Set<string>()
  for (const k of sourceEventIds) {
    const parsed = parseDerivedKey(k)
    if (parsed) set.add(parsed.observationId)
  }
  return set
}

/** Observations que todavía NO fueron derivadas (idempotencia barata antes
 *  de llamar al LLM). */
export function selectUncoveredObservations(
  observations: Observation[],
  covered: Set<string>,
): Observation[] {
  return observations.filter((o) => !covered.has(o.id))
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
    id: `mem_${deriveKey(obs.id, 0)}`,
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
    sourceEventId: deriveKey(obs.id, 0),
    // observationId NO está en el type Memory; lo agrega el row builder.
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
      id: `mem_${key}`,
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

// ─── Row builder para INSERT (incluye observation_id) ───────────────

/** observation_id se infiere de la clave estable (obs:<id>:<n>). */
export function derivedMemoryToRow(m: Memory, userId: string): Record<string, unknown> {
  const parsed = parseDerivedKey(m.sourceEventId)
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
    source_event_id: m.sourceEventId ?? null,
    observation_id: parsed ? parsed.observationId : null,
  }
}
