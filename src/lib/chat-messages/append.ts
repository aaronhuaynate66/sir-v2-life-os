// SIR V2 — chat_messages: append al sustrato canónico del chat.
//
// La FUENTE ÚNICA a nivel mensaje (ver migración 0141). Todos los caminos de
// ingesta (export de WhatsApp, SIR Reader) appendan acá cada mensaje entero.
// Dedupe idempotente por `id`: un hash determinístico de los campos que definen
// "el mismo mensaje" (dueño+persona+fuente+fecha+emisor+texto). Re-subir el mismo
// chat es seguro; un chat que creció solo agrega el delta.
//
// `toChatRows` es PURO (testeable); `appendChatMessages` hace el upsert por lotes.

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ChatSender = 'user' | 'other'

/** Un mensaje a persistir (lo arma cada camino de ingesta). */
export interface ChatMessageInput {
  /** ISO 8601 (fecha+hora) o null si el origen no lo expone. */
  iso: string | null
  /** 'user' = el dueño del SIR; 'other' = la persona del chat. */
  sender: ChatSender
  /** Nombre crudo del participante (trazabilidad). */
  authorName?: string | null
  /** Texto completo del mensaje ('[media]' para adjuntos). */
  content: string
  isMedia?: boolean
}

export interface ChatMessageRow {
  id: string
  user_id: string
  person_id: string
  source: string
  sender: ChatSender
  author_name: string | null
  sent_at: string | null
  content: string
  is_media: boolean
}

const MAX_CONTENT = 8000
const MAX_AUTHOR = 120
const UPSERT_BATCH = 500

/**
 * Id determinístico del mensaje → dedupe idempotente. sha1 de los campos que
 * definen "el mismo mensaje". Nota: dos mensajes con idéntico (fecha, emisor,
 * texto) colapsan a uno — aceptable para un sustrato de texto (mismo minuto +
 * mismo emisor + mismo contenido ≈ el mismo mensaje para análisis).
 */
export function chatMessageId(
  userId: string,
  personId: string,
  source: string,
  iso: string | null,
  sender: ChatSender,
  content: string,
): string {
  const s = `${userId}|${personId}|${source}|${iso ?? ''}|${sender}|${content}`
  return `cm_${createHash('sha1').update(s).digest('hex')}`
}

/** Mapea inputs → filas listas para upsert. PURO. Descarta mensajes vacíos
 *  no-media y acota tamaños. El `id` sale del hash determinístico. */
export function toChatRows(
  userId: string,
  personId: string,
  source: string,
  messages: ChatMessageInput[],
): ChatMessageRow[] {
  const rows: ChatMessageRow[] = []
  for (const m of messages) {
    const content = (m.content ?? '').slice(0, MAX_CONTENT)
    if (content.length === 0 && m.isMedia !== true) continue
    const sender: ChatSender = m.sender === 'user' ? 'user' : 'other'
    const iso = typeof m.iso === 'string' && m.iso.length >= 10 ? m.iso : null
    rows.push({
      id: chatMessageId(userId, personId, source, iso, sender, content),
      user_id: userId,
      person_id: personId,
      source,
      sender,
      author_name: typeof m.authorName === 'string' && m.authorName.trim().length > 0
        ? m.authorName.trim().slice(0, MAX_AUTHOR)
        : null,
      sent_at: iso,
      content,
      is_media: m.isMedia === true,
    })
  }
  return rows
}

/** Dedupe intra-lote por id (dos mensajes idénticos dentro del mismo import). */
function dedupeById(rows: ChatMessageRow[]): ChatMessageRow[] {
  const seen = new Set<string>()
  const out: ChatMessageRow[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}

/**
 * Appenda mensajes al sustrato. Upsert idempotente (dedupe por `id`), por lotes.
 * Best-effort: cada lote se intenta por separado; un fallo no aborta el resto.
 * Devuelve cuántas filas únicas se intentaron persistir.
 */
export async function appendChatMessages(
  client: SupabaseClient,
  params: { userId: string; personId: string; source: string; messages: ChatMessageInput[] },
): Promise<number> {
  const rows = dedupeById(toChatRows(params.userId, params.personId, params.source, params.messages))
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const slice = rows.slice(i, i + UPSERT_BATCH)
    const { error } = await client.from('chat_messages').upsert(slice, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
  return rows.length
}
