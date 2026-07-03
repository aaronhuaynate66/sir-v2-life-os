// SIR V2 — SIR Reader: núcleo PURO de ingesta de conversaciones leídas del
// navegador logueado (Teams primero; ver docs/READER_ARCHITECTURE.md).
//
// Agnóstico de plataforma y de transporte: un cliente (extensión MV3, userscript,
// o incluso pegar texto) manda un batch de mensajes de UN hilo; acá los
// normalizamos, deduplicamos por hash estable, filtramos a solo lo NUEVO
// (incremental) y armamos un bloque de conversación canónico que el pipeline de
// conversación existente (chunk → interpret → consolidate) puede consumir.
//
// PURO: sin red, sin reloj, sin crypto. El hash es determinístico (djb2) para
// que el mismo mensaje siempre colapse, en el cliente y en el server.

export type ReaderPlatform = 'teams' | 'slack' | 'linkedin' | 'instagram' | 'facebook' | 'other'

export interface ReaderMessage {
  /** Autor visible del mensaje (nombre o handle). '' = desconocido. */
  author: string
  text: string
  /** Timestamp ISO del mensaje. Puede faltar (algunos DOM no lo exponen). */
  ts?: string | null
}

export interface ReaderBatch {
  platform: ReaderPlatform
  /** Id estable del hilo/conversación en la plataforma. */
  threadId: string
  /** Nombre visible del hilo (persona o canal) — para atribuir a la persona. */
  threadName: string
  messages: ReaderMessage[]
}

export interface NormalizedMessage extends ReaderMessage {
  /** Hash estable (threadId|author|ts|text) para dedup idempotente. */
  hash: string
}

const MAX_TEXT = 4000
const MAX_AUTHOR = 120

/** Hash determinístico djb2 → hex. Sin crypto (así corre igual en el content
 *  script del navegador y en el server, y es testeable). */
export function readerHash(threadId: string, m: ReaderMessage): string {
  const s = `${threadId}|${m.author ?? ''}|${m.ts ?? ''}|${m.text ?? ''}`
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

function clean(s: string | null | undefined, max: number): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Normaliza + hashea. Descarta mensajes sin texto (ruido de UI). */
export function normalizeMessages(batch: ReaderBatch): NormalizedMessage[] {
  const out: NormalizedMessage[] = []
  for (const raw of batch.messages ?? []) {
    const text = clean(raw.text, MAX_TEXT)
    if (!text) continue
    const m: ReaderMessage = { author: clean(raw.author, MAX_AUTHOR), text, ts: raw.ts ?? null }
    out.push({ ...m, hash: readerHash(batch.threadId, m) })
  }
  return out
}

/**
 * Deja solo los mensajes cuyo hash NO está en `seen` (dedup idempotente). Además
 * colapsa duplicados dentro del mismo batch. Devuelve los nuevos EN ORDEN.
 */
export function dedupeNew(messages: NormalizedMessage[], seen: Set<string>): NormalizedMessage[] {
  const out: NormalizedMessage[] = []
  const inBatch = new Set<string>()
  for (const m of messages) {
    if (seen.has(m.hash) || inBatch.has(m.hash)) continue
    inBatch.add(m.hash)
    out.push(m)
  }
  return out
}

/**
 * Filtra a mensajes POSTERIORES a `lastTs` (incremental: "dejar Teams abierto"
 * acumula sin re-procesar lo viejo). Los mensajes sin ts se conservan (no
 * podemos ubicarlos en el tiempo; el dedup por hash evita repetirlos).
 */
export function sinceTimestamp(messages: NormalizedMessage[], lastTs: string | null | undefined): NormalizedMessage[] {
  if (!lastTs) return messages
  const cut = Date.parse(lastTs)
  if (!Number.isFinite(cut)) return messages
  return messages.filter((m) => {
    if (!m.ts) return true
    const t = Date.parse(m.ts)
    return !Number.isFinite(t) || t > cut
  })
}

/**
 * Arma un bloque de conversación canónico (una línea por mensaje) que el
 * pipeline de conversación existente puede chunquear/interpretar. Formato
 * legible y estable: "[ts] Autor: texto".
 */
export function buildConversationText(threadName: string, messages: NormalizedMessage[]): string {
  const header = threadName ? `Conversación con ${threadName}:` : 'Conversación:'
  const lines = messages.map((m) => {
    const when = m.ts ? `[${m.ts}] ` : ''
    const who = m.author || 'alguien'
    return `${when}${who}: ${m.text}`
  })
  return [header, ...lines].join('\n')
}

export interface IngestPlan {
  /** Mensajes nuevos (deduplicados + incrementales), en orden. */
  fresh: NormalizedMessage[]
  /** Bloque de texto listo para el pipeline de conversación. '' si no hay nuevos. */
  conversationText: string
  /** Hashes a agregar al set de "vistos" tras persistir. */
  newHashes: string[]
  /** ts del último mensaje nuevo con fecha (para el próximo incremental). */
  latestTs: string | null
}

/**
 * Plan de ingesta PURO: normaliza → incremental (since lastTs) → dedup (vs seen)
 * → arma el texto. El caller (endpoint) decide persistir e interpretar.
 */
export function planIngest(batch: ReaderBatch, seen: Set<string>, lastTs: string | null): IngestPlan {
  const normalized = normalizeMessages(batch)
  const incremental = sinceTimestamp(normalized, lastTs)
  const fresh = dedupeNew(incremental, seen)
  const latestTs = fresh.reduce<string | null>((acc, m) => {
    if (!m.ts) return acc
    if (!acc) return m.ts
    return Date.parse(m.ts) > Date.parse(acc) ? m.ts : acc
  }, null)
  return {
    fresh,
    conversationText: fresh.length ? buildConversationText(batch.threadName, fresh) : '',
    newHashes: fresh.map((m) => m.hash),
    latestTs,
  }
}
