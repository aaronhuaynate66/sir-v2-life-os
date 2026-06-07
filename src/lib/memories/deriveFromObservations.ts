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
import { CONVERSATION_CAPTURE_TYPES } from '@/lib/capture/observations/types'
import {
  readConversationSignals,
  hasRichConversationData,
  type ConversationSignals,
} from './conversationSignals'

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
  /** Señales partidas por recencia (sólo conversaciones con material rico). El
   *  prompt las usa para priorizar lo reciente y degradar lo viejo. */
  conversation?: ConversationSignals
}

/** ¿Es una observación de conversación (whatsapp_chat / whatsapp_web)? */
export function isConversationCapture(captureType: CaptureType): boolean {
  return (CONVERSATION_CAPTURE_TYPES as readonly CaptureType[]).includes(captureType)
}

/** Resumen compacto de una observation para el prompt del LLM (indexado).
 *  Para conversaciones con material rico, adjunta las señales por recencia
 *  (`now` inyectable para tests). */
export function digestObservations(
  observations: Observation[],
  now: Date = new Date(),
): ObservationDigest[] {
  return observations.map((o, index) => {
    const emo = extractEmotionalStates(o)
    const conversation =
      isConversationCapture(o.captureType) && hasRichConversationData(o.data ?? {})
        ? readConversationSignals(o.data ?? {}, o.observedAt, now)
        : undefined
    return {
      index,
      observationId: o.id,
      captureType: o.captureType,
      observedAt: o.observedAt,
      text: extractObservationText(o),
      topics: extractTopics(o),
      emotionalUser: emo.user,
      emotionalOther: emo.other,
      conversation,
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

/** Categoría de la señal extraída (conciencia del objetivo/relación). Mapea a
 *  un tag legible; opcional y tolerante (valor libre → tag tal cual). */
export type DerivedCategory =
  | 'profesional'
  | 'comercial'
  | 'reciprocidad'
  | 'riesgo'
  | 'objecion'
  | 'personal'
  | 'proxima_accion'

/** Recencia auto-reportada por el LLM para la señal (estado actual vs contexto). */
export type DerivedRecency = 'recent' | 'historical'

/** Item crudo que esperamos del LLM (validado defensivamente). */
export interface DerivedMemoryItem {
  observationIndex: number
  type?: string
  title?: string
  content?: string
  emotionalCharge?: number
  importance?: number
  tags?: string[]
  /** Categoría de la señal (negocio, reciprocidad, riesgo, próxima acción…). */
  category?: string
  /** 'recent' = estado actual/accionable; 'historical' = contexto viejo. */
  recency?: string
  /** true si el hecho ya NO está vigente (ej. un rol de hace años). */
  isStale?: boolean
}

/** Tope de memorias por conversación (más rico que un perfil/nota). */
export const MAX_MEMORIES_PER_CONVERSATION = 8
/** Importancia máxima de una memoria histórica/obsoleta: no debe dominar. */
const HISTORICAL_IMPORTANCE_CAP = 4
const STALE_IMPORTANCE_CAP = 2

/** Tag canónico de cada categoría conocida (las desconocidas pasan tal cual). */
const CATEGORY_TAG: Record<DerivedCategory, string> = {
  profesional: 'profesional',
  comercial: 'comercial',
  reciprocidad: 'reciprocidad',
  riesgo: 'riesgo',
  objecion: 'objeción',
  personal: 'personal',
  proxima_accion: 'próximo_paso',
}

/**
 * Asigna `count` índices NUEVOS para las memorias de una observación, evitando
 * un conjunto de índices RESERVADOS (típicamente los de memorias que el usuario
 * descartó: tombstones is_obsolete=true). Devuelve los índices libres más bajos
 * (0,1,2…) que no estén reservados, para no resucitar un descarte vía el PK
 * determinístico y mantener los ids chicos. PURO.
 */
export function assignDerivedIndices(reserved: Set<number>, count: number): number[] {
  const out: number[] = []
  let i = 0
  while (out.length < count) {
    if (!reserved.has(i)) out.push(i)
    i += 1
  }
  return out
}

export interface MemoriesFromLlmOptions {
  /** Máximo de memorias NUEVAS por observation. Number o función del obs (ej.
   *  conversaciones admiten más que un perfil). Default 2 (compat histórica). */
  maxPerObservation?: number | ((obs: Observation) => number)
  /** Índices RESERVADOS por observación (memorias descartadas/tombstones) para
   *  no reusar su PK determinístico ni resucitarlas. */
  reservedIndices?: Map<string, Set<number>>
}

/** Aplica la degradación por recencia a la importancia: histórico y obsoleto NO
 *  deben dominar la síntesis. Devuelve la importancia ya clampeada. */
function importanceWithRecency(item: DerivedMemoryItem): number {
  let importance = clampImportance(item.importance)
  if (item.isStale) return Math.min(importance, STALE_IMPORTANCE_CAP)
  if (item.recency === 'historical') importance = Math.min(importance, HISTORICAL_IMPORTANCE_CAP)
  return importance
}

/** Tags finales de una memoria derivada: tags del item + tag de categoría +
 *  marcas de recencia (histórico/obsoleto), deduplicados y acotados. */
function tagsForItem(obs: Observation, item: DerivedMemoryItem): string[] {
  const base = Array.isArray(item.tags)
    ? item.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim())
    : extractTopics(obs)
  const extra: string[] = []
  if (item.category) {
    const cat = item.category.trim().toLowerCase()
    extra.push(CATEGORY_TAG[cat as DerivedCategory] ?? cat)
  }
  if (item.isStale) extra.push('obsoleto')
  else if (item.recency === 'historical') extra.push('histórico')
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of [...extra, ...base]) {
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= 10) break
  }
  return out
}

/**
 * Mapea items del LLM a Memory[] con claves estables por observation. Los
 * items inválidos (índice fuera de rango, sin content, tipo no permitido) se
 * descartan. Se respeta un máximo por observation y se asignan índices libres
 * (saltando los reservados/descartados) para construir PKs únicos y estables.
 *
 * Recencia: los items marcados como 'historical' u `isStale` se DEGRADAN en
 * importancia y se taggean ('histórico'/'obsoleto') para que el contexto viejo
 * no domine la ficha (caso Dayana: el rol de delegada de hace años deja de
 * pesar como si fuera estado actual).
 */
export function memoriesFromLlmItems(
  personName: string,
  observations: Observation[],
  items: DerivedMemoryItem[],
  opts: MemoriesFromLlmOptions = {},
): Memory[] {
  const out: Memory[] = []
  // Índices ya usados por obs (semilla = reservados); y conteo de NUEVAS.
  const usedIdx = new Map<string, Set<number>>()
  const addedCount = new Map<string, number>()

  const capFor = (obs: Observation): number => {
    const m = opts.maxPerObservation
    if (typeof m === 'function') return m(obs)
    return m ?? MAX_MEMORIES_PER_OBSERVATION
  }

  for (const item of items) {
    const idx = item.observationIndex
    if (!Number.isInteger(idx) || idx < 0 || idx >= observations.length) continue
    const obs = observations[idx]

    const content = str(item.content)
    if (!content) continue

    const added = addedCount.get(obs.id) ?? 0
    if (added >= capFor(obs)) continue

    // Índice libre más bajo que no choque con reservados ni con lo ya usado.
    let set = usedIdx.get(obs.id)
    if (!set) {
      set = new Set(opts.reservedIndices?.get(obs.id) ?? [])
      usedIdx.set(obs.id, set)
    }
    let assigned = 0
    while (set.has(assigned)) assigned += 1
    set.add(assigned)

    const type =
      typeof item.type === 'string' &&
      (ALLOWED_DERIVED_TYPES as string[]).includes(item.type)
        ? (item.type as Memory['type'])
        : (BASE_MEMORY_TYPE[obs.captureType] ?? 'semantic')

    const title = str(item.title) ?? `Con ${personName}`
    const timestamp = obs.observedAt || obs.capturedAt || obs.createdAt
    const key = deriveKey(obs.id, assigned)

    out.push({
      id: derivedMemoryId(obs.id, assigned),
      type,
      title,
      content,
      entities: obs.personId ? [obs.personId] : [],
      emotionalCharge: clampCharge(item.emotionalCharge),
      importance: importanceWithRecency(item),
      timestamp,
      lastAccessed: timestamp,
      decayRate: DEFAULT_DECAY_RATE,
      tags: tagsForItem(obs, item),
      relatedMemories: [],
      personId: obs.personId ?? undefined,
      source: 'inferred',
      sourceEventId: key,
    })
    addedCount.set(obs.id, added + 1)
  }

  return out
}

// ─── Supresión por firma (memorias privadas/excluidas) ──────────────
//
// PROBLEMA: marcar una memoria como privada (is_private, mig 0064) la saca de
// la vista general y de la IA, pero la conversación FUENTE sigue conteniendo el
// hecho. Sin esto, re-derivar la resucitaría con un PK nuevo (el reservado-por-
// índice de los tombstones sólo protege el slot exacto, no el contenido).
//
// SOLUCIÓN: antes de insertar las memorias nuevas, las comparamos contra las
// PRIVADAS existentes de la persona por una firma normalizada del contenido
// (+tags). Equivalente = match normalizado exacto O solape de tokens (Jaccard)
// por encima del umbral → se descarta la nueva. Tolerante a reformulaciones del
// LLM ("le gusta el fútbol" ≈ "es fanático del fútbol") sin sobre-suprimir
// hechos genuinamente distintos. PURO + determinístico.

/** Stopwords ES (+ relleno frecuente) que no aportan a la firma de un hecho. */
const SIGNATURE_STOPWORDS = new Set([
  'que', 'con', 'por', 'para', 'una', 'unos', 'unas', 'los', 'las', 'del', 'sus',
  'este', 'esta', 'esto', 'esa', 'ese', 'eso', 'como', 'pero', 'muy', 'mas',
  'has', 'han', 'hay', 'fue', 'son', 'era', 'tiene', 'tienen', 'estan',
  'sobre', 'entre', 'cuando', 'donde', 'porque', 'tambien', 'desde', 'hasta',
  'su', 'se', 'al', 'es', 'un', 'no', 'si', 'me', 'mi', 'te', 'tu',
])

/** Normaliza texto para firma: minúsculas, sin acentos, sólo alfanumérico (con
 *  ñ), espacios colapsados. Determinístico. */
export function normalizeForSignature(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Conjunto de tokens significativos del CONTENIDO de una memoria, descartando
 *  stopwords y tokens cortos. Base del solape Jaccard.
 *
 *  Sólo el contenido (el HECHO), no los tags: los tags son categorías derivadas
 *  que el LLM puede no re-emitir igual entre corridas; incluirlos rompe el
 *  solape de forma asimétrica (una privada con tag 'personal' vs su misma
 *  reformulación sin tags). El hecho en prosa es la señal estable. */
export function signatureTokens(content: string): Set<string> {
  const text = normalizeForSignature(content ?? '')
  const out = new Set<string>()
  if (!text) return out
  for (const tok of text.split(' ')) {
    if (tok.length < 3) continue
    if (SIGNATURE_STOPWORDS.has(tok)) continue
    out.add(tok)
  }
  return out
}

/** Índice de supresión construido desde las memorias privadas de una persona. */
export interface SuppressionIndex {
  /** Contenidos normalizados exactos (match barato y seguro). */
  exact: Set<string>
  /** Sets de tokens por memoria privada (para el solape Jaccard). */
  tokenSets: Set<string>[]
}

export function buildSuppressionIndex(items: { content: string }[]): SuppressionIndex {
  const exact = new Set<string>()
  const tokenSets: Set<string>[] = []
  for (const it of items) {
    const norm = normalizeForSignature(it.content ?? '')
    if (norm) exact.add(norm)
    const ts = signatureTokens(it.content ?? '')
    if (ts.size > 0) tokenSets.push(ts)
  }
  return { exact, tokenSets }
}

/** Similitud de Jaccard entre dos conjuntos de tokens (0..1). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  return inter / (a.size + b.size - inter)
}

/** Umbral de solape para considerar dos memorias EQUIVALENTES. 0.6 atrapa
 *  reformulaciones del LLM sin colapsar hechos distintos que comparten unas
 *  pocas palabras. */
export const SUPPRESSION_JACCARD_THRESHOLD = 0.6

/** ¿La memoria candidata (por su contenido) es equivalente a alguna privada? */
export function isEquivalentToSuppressed(content: string, index: SuppressionIndex): boolean {
  if (index.exact.size === 0 && index.tokenSets.length === 0) return false
  const norm = normalizeForSignature(content ?? '')
  if (norm && index.exact.has(norm)) return true
  const ts = signatureTokens(content ?? '')
  if (ts.size === 0) return false
  for (const other of index.tokenSets) {
    if (jaccard(ts, other) >= SUPPRESSION_JACCARD_THRESHOLD) return true
  }
  return false
}

/** Filtra las memorias nuevas, descartando las equivalentes a una privada.
 *  Devuelve {kept, suppressed}. PURO. */
export function suppressEquivalentToPrivate(
  memories: Memory[],
  index: SuppressionIndex,
): { kept: Memory[]; suppressed: number } {
  if (index.exact.size === 0 && index.tokenSets.length === 0) {
    return { kept: memories, suppressed: 0 }
  }
  const kept = memories.filter((m) => !isEquivalentToSuppressed(m.content, index))
  return { kept, suppressed: memories.length - kept.length }
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
