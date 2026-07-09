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

/** Tope defensivo: un hilo puede tener decenas de miles de mensajes; leemos hasta
 *  acá para el análisis de conversación (más que suficiente para el Pulso/ensayo). */
const DEFAULT_LIMIT = 50_000

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

/** Trae los mensajes de una persona desde el sustrato, en orden cronológico. */
export async function fetchChatMessages(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<ChatMsgRow[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('sender, sent_at, content, is_media')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .order('sent_at', { ascending: true, nullsFirst: false })
    .limit(limit)
  return (data ?? []) as ChatMsgRow[]
}
