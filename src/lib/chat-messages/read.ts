// SIR V2 — chat_messages: capa de LECTURA del sustrato canónico.
//
// La contraparte de append.ts: trae los mensajes reales de una persona desde el
// sustrato (chat_messages, mig 0141) y los mapea al ConvMsg unificado que ya
// consumen los analizadores de conversación (Pulso C0, ensayo, etc.).
//
// `chatRowsToConvMsg` es PURO (testeable); `fetchChatMessages` es el wrapper de query.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ConvMsg } from '@/lib/conversation-analytics/analyze'

/** Fila mínima que necesitamos del sustrato para armar el stream de mensajes. */
export interface ChatMsgRow {
  sender: string
  sent_at: string | null
  content: string
  is_media?: boolean | null
}

/** Ventana reciente que leemos para el análisis de conversación. Más que
 *  suficiente para el Pulso/ensayo (recencia, cadencia, tono, temas); el trend de
 *  volumen de largo plazo lo cubre la serie semanal pre-agregada. */
const DEFAULT_LIMIT = 10_000
/** Supabase/PostgREST corta cada request a ~1000 filas; paginamos con range(). */
const PAGE = 1_000

/** PURO: mapea filas del sustrato a mensajes unificados (ConvMsg). Descarta los
 *  que no tienen texto o fecha resoluble (no ubicables en el tiempo). */
export function chatRowsToConvMsg(rows: ChatMsgRow[]): ConvMsg[] {
  const out: ConvMsg[] = []
  for (const r of rows) {
    const text = (r.content ?? '').trim()
    if (!text || !r.sent_at) continue
    const at = Date.parse(r.sent_at)
    if (Number.isNaN(at)) continue
    out.push({ fromMe: r.sender === 'user', at, text })
  }
  return out
}

/** Trae la ventana RECIENTE de mensajes de una persona desde el sustrato.
 *  Pagina con range() porque PostgREST corta cada request a ~1000 filas (un
 *  `.limit(50000)` suelto devolvía solo 1000 — y ascendente, ¡los más VIEJOS!).
 *  Lee descendente (recientes primero) hasta `limit` y devuelve en orden
 *  cronológico ascendente. */
export async function fetchChatMessages(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<ChatMsgRow[]> {
  const out: ChatMsgRow[] = []
  for (let from = 0; from < limit; from += PAGE) {
    const to = Math.min(from + PAGE, limit) - 1
    const { data, error } = await supabase
      .from('chat_messages')
      .select('sender, sent_at, content, is_media')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .range(from, to)
    if (error || !data || data.length === 0) break
    out.push(...(data as ChatMsgRow[]))
    if (data.length < PAGE) break
  }
  // Descendente → cronológico ascendente (lo que esperan los analizadores).
  return out.reverse()
}
