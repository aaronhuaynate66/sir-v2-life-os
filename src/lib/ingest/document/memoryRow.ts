// SIR V2 — Ingestión documental: builder PURO de rows de `memories`.
//
// Un documento se materializa como memorias directas (NO como observation:
// observations tiene un check de capture_type que no incluye documentos, y su
// modelo está acoplado a persona/captura). person_id es opcional (un documento
// puede o no ligarse a alguien), observation_id queda null, source='document'.
//
// IDEMPOTENCIA: el id del PK se deriva de (hash del texto, índice). Re-ingerir
// el mismo documento produce los mismos ids → upsert ignoreDuplicates no
// duplica. El prefijo 'doc_' NO colisiona con las memorias derivadas de
// observations ('mem_obs:...'): observationIdFromMemoryId devuelve null para
// 'doc_', así que la derivación por-persona nunca las toca.

import { createHash } from 'node:crypto'

import type { DocMemoryProposal, DocMemoryType } from './types'

const VALID_MEMORY_TYPES: readonly DocMemoryType[] = ['semantic', 'episodic', 'emotional', 'temporal']

/** Hash estable (sha1, 16 hex) del texto del documento. Determinístico. */
export function documentTextHash(text: string): string {
  return createHash('sha1').update(text ?? '').digest('hex').slice(0, 16)
}

/** Id de PK determinístico para la memoria #index de un documento. */
export function documentMemoryId(hash: string, index: number): string {
  return `doc_${hash}_${index}`
}

function clampImportance(x: unknown): number {
  const n = typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : 5
  return Math.min(10, Math.max(1, n))
}

/**
 * Re-valida/sanea las propuestas que vuelven del cliente al confirmar (el
 * usuario pudo editarlas). Descarta las que quedaron sin contenido. PURO.
 */
export function sanitizeProposals(input: unknown): DocMemoryProposal[] {
  if (!Array.isArray(input)) return []
  const out: DocMemoryProposal[] = []
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) continue
    const o = raw as Record<string, unknown>
    const content = typeof o.content === 'string' ? o.content.trim().slice(0, 800) : ''
    if (content.length === 0) continue
    const type = VALID_MEMORY_TYPES.includes(o.type as DocMemoryType)
      ? (o.type as DocMemoryType)
      : 'semantic'
    const title = (typeof o.title === 'string' ? o.title.trim().slice(0, 160) : '') || content.slice(0, 60)
    const tags = Array.isArray(o.tags)
      ? o.tags
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 8)
      : []
    out.push({ type, title, content, importance: clampImportance(o.importance), tags })
  }
  return out
}

export interface BuildRowOpts {
  userId: string
  docHash: string
  index: number
  personId: string | null
  /** ISO 8601 — momento de la ingestión (occurred_at / last_accessed). */
  occurredAt: string
  /** Título del documento — se suma como tag para agrupar sus memorias. */
  docTitle: string
}

/**
 * Convierte una propuesta (ya saneada) en un row listo para insertar en
 * `memories`. PURO. El caller hace el upsert con onConflict: 'id'.
 */
export function proposalToMemoryRow(
  p: DocMemoryProposal,
  opts: BuildRowOpts,
): Record<string, unknown> {
  const docTag = opts.docTitle ? `doc:${opts.docTitle}`.slice(0, 60) : 'doc'
  const tags = Array.from(new Set([...p.tags, docTag])).slice(0, 10)
  return {
    id: documentMemoryId(opts.docHash, opts.index),
    user_id: opts.userId,
    person_id: opts.personId,
    type: p.type,
    title: p.title,
    content: p.content,
    entities: opts.personId ? [opts.personId] : [],
    emotional_charge: 0,
    importance: p.importance,
    decay_rate: 0.05,
    tags,
    related_memories: [],
    occurred_at: opts.occurredAt,
    last_accessed: opts.occurredAt,
    source: 'document',
    observation_id: null,
  }
}

/** Construye todos los rows de un documento (idempotentes por índice). PURO. */
export function buildDocumentMemoryRows(
  proposals: DocMemoryProposal[],
  opts: Omit<BuildRowOpts, 'index'>,
): Record<string, unknown>[] {
  return proposals.map((p, i) => proposalToMemoryRow(p, { ...opts, index: i }))
}
