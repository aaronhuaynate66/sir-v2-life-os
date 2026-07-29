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
 * LA CONVENCIÓN DE TIEMPO DE ESTE SUSTRATO — leer antes de tocar `sent_at`.
 *
 * `sent_at` guarda la HORA DE PARED DE LIMA con sufijo 'Z'. O sea: NO es el
 * instante UTC real, es la hora que Aaron vio en su pantalla, codificada como si
 * fuera UTC. Es legítimo y sin ambigüedad porque Perú no usa horario de verano
 * desde 1994: el desfase es -05:00 SIEMPRE, así que la codificación no pierde
 * información.
 *
 * POR QUÉ ESTA Y NO EL UTC REAL: 289k filas ya están así (todo el import de
 * exports) y todos los renders leen la hora del ISO directo. Migrar era el
 * cambio grande y riesgoso; normalizar los 2,810 del reader, el chico.
 *
 * DE DÓNDE SALIÓ (bug real, 29-jul-2026): el lector del Store de WhatsApp usa el
 * epoch del mensaje → instante UTC REAL, mientras el importador parsea la hora
 * MOSTRADA → hora de pared. El mismo mensaje quedaba guardado dos veces con 5
 * horas de diferencia (18:44 vs 23:44:31) y ningún hash podía cruzarlos, porque
 * son instantes distintos. Todo camino que tenga un epoch o un ISO con offset
 * real DEBE pasar por `limaWallClock` antes de appendar.
 *
 * DEUDA CONSCIENTE: `sent_at` no es comparable contra `now()` sin restar 5 h.
 * Hoy solo lo usan métricas de granularidad diaria ("hace X días"), donde 5 h no
 * cambia la respuesta. Si alguna vez se necesita precisión horaria contra el
 * presente, hay que migrar las 289k y auditar los renders.
 */
export const LIMA_OFFSET_HORAS = -5

/**
 * Instante real (epoch ms, o ISO con Z/offset) → hora de pared de Lima en ISO
 * con 'Z', que es lo que este sustrato guarda. Devuelve null si no es fechable.
 */
export function limaWallClock(instant: string | number | null | undefined): string | null {
  if (instant === null || instant === undefined || instant === '') return null
  const d = new Date(instant)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getTime() + LIMA_OFFSET_HORAS * 3600_000).toISOString()
}

/**
 * Canal al que pertenece el mensaje, para efectos de IDENTIDAD. `source` mezcla
 * dos cosas distintas: el CANAL ('whatsapp') y el CAMINO DE CAPTURA ('reader').
 * Un mismo mensaje de WhatsApp capturado por la extensión y luego por el export
 * traía source distinto → hash distinto → duplicado inevitable. Para el id vale
 * el canal; `source` se sigue guardando tal cual como trazabilidad de origen.
 *
 * SOLO se normalizan los canales que tienen DOS caminos de ingesta, hoy nada más
 * WhatsApp (extensión en vivo + importador de exports). El reader también trae
 * `teams` y `email`, pero esos no tienen un segundo camino, así que normalizarlos
 * no evitaría ningún duplicado y en cambio cambiaría el id de filas que ya están
 * guardadas —y `chat_messages` no guarda la plataforma, así que no se puede saber
 * con certeza cuál fila vino de cuál—.
 *
 * OJO AL AGREGAR UN CANAL A ESTA LISTA: cambia el id de las filas `source=reader`
 * de ese canal, así que hay que reescribirlas de una vez (scripts/repair-chat-ids.mjs)
 * o el próximo ingest las va a duplicar.
 */
export const CANALES_CON_DOBLE_INGESTA = new Set(['whatsapp'])

export function canalDe(source: string, platform?: string | null): string {
  const p = (platform ?? '').trim().toLowerCase()
  const esCaminoDeCaptura = source === 'reader' || source === 'channel'
  if (esCaminoDeCaptura && CANALES_CON_DOBLE_INGESTA.has(p)) return p
  return source
}

/**
 * Normaliza un ISO a la MARCA DE MINUTO en UTC ("YYYY-MM-DDTHH:MM"). La
 * identidad de un mensaje es a nivel MINUTO (no de segundos): dos capturas del
 * mismo mensaje con precisión distinta —una con ":45", otra truncada a ":00"—
 * deben colapsar al mismo id. Antes se hasheaba el `iso` CRUDO, así que las dos
 * corridas de import (09/07 con segundos, 12/07 truncada) generaron ids
 * distintos para el mismo mensaje → 148k duplicados (limpiados el 20/07). En UTC
 * para que sea estable ante representaciones de zona horaria. null → ''.
 */
export function minuteKey(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 16)
  return iso.slice(0, 16) // fallback: iso no parseable → recorte textual a minuto
}

/**
 * Id determinístico del mensaje → dedupe idempotente. sha1 de los campos que
 * definen "el mismo mensaje". Nota: dos mensajes con idéntico (fecha a MINUTO,
 * emisor, texto) colapsan a uno — aceptable para un sustrato de texto (mismo
 * minuto + mismo emisor + mismo contenido ≈ el mismo mensaje para análisis).
 */
export function chatMessageId(
  userId: string,
  personId: string,
  canal: string,
  iso: string | null,
  sender: ChatSender,
  content: string,
): string {
  const s = `${userId}|${personId}|${canal}|${minuteKey(iso)}|${sender}|${content}`
  return `cm_${createHash('sha1').update(s).digest('hex')}`
}

/** Mapea inputs → filas listas para upsert. PURO. Descarta mensajes vacíos
 *  no-media y acota tamaños. El `id` sale del hash determinístico.
 *  `platform` es el canal real cuando `source` es un camino de captura
 *  ('reader'): sin él, el mismo mensaje de WhatsApp visto por la extensión y por
 *  el export no colapsa (ver `canalDe`). */
export function toChatRows(
  userId: string,
  personId: string,
  source: string,
  messages: ChatMessageInput[],
  platform?: string | null,
): ChatMessageRow[] {
  const canal = canalDe(source, platform)
  const rows: ChatMessageRow[] = []
  for (const m of messages) {
    const content = (m.content ?? '').slice(0, MAX_CONTENT)
    if (content.length === 0 && m.isMedia !== true) continue
    const sender: ChatSender = m.sender === 'user' ? 'user' : 'other'
    const iso = typeof m.iso === 'string' && m.iso.length >= 10 ? m.iso : null
    rows.push({
      id: chatMessageId(userId, personId, canal, iso, sender, content),
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
  params: { userId: string; personId: string; source: string; messages: ChatMessageInput[]; platform?: string | null },
): Promise<number> {
  const rows = dedupeById(toChatRows(params.userId, params.personId, params.source, params.messages, params.platform))
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const slice = rows.slice(i, i + UPSERT_BATCH)
    const { error } = await client.from('chat_messages').upsert(slice, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
  return rows.length
}
