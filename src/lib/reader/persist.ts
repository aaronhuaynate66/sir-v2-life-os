// SIR V2 — SIR Reader: persistencia compartida de un batch (núcleo del ingest).
//
// Lo usan los dos caminos: /api/reader/ingest (token, para la extensión) y
// /api/reader/paste (sesión, pegar conversación). Carga el cursor del hilo →
// planIngest (puro, idempotente) → persiste UNA observación dm_conversation con
// lo nuevo, atribuida a la persona por el nombre del hilo → avanza el cursor.

import type { SupabaseClient } from '@supabase/supabase-js'

import { planIngest, type ReaderBatch } from './ingest'
import { namesLooselyMatch } from '@/lib/people/nameMatch'
import { resolvePersonId, type PersonMatchRow } from '@/lib/people/emailMatch'
import { appendChatMessages } from '@/lib/chat-messages/append'

const HASH_WINDOW = 400

export interface IngestResult {
  ingested: number
  observationId?: string
  personId?: string | null
  personMatched?: boolean
  reason?: string
}

/**
 * Atribuye la persona del remitente. PRIORIZA el email exacto (llave estable) y
 * cae al nombre del hilo (match laxo). Solo atribuye si hay UNA sola persona
 * (guarda anti-ambigüedad). La lógica pura vive en resolvePersonId.
 */
async function matchPersonId(
  client: SupabaseClient, userId: string, threadName: string, senderEmail?: string,
): Promise<string | null> {
  if (!threadName && !senderEmail) return null
  try {
    const { data } = await client.from('people').select('id, name, alias, email').eq('user_id', userId).limit(2000)
    return resolvePersonId((data ?? []) as PersonMatchRow[], { threadName, fromEmail: senderEmail })
  } catch { return null }
}

/**
 * Ingesta un batch: dedup incremental (planIngest) + observación + cursor.
 * `client` puede ser service-role (token) o de sesión con RLS (paste). Tira si
 * el insert de la observación falla.
 */
export async function ingestReaderBatch(client: SupabaseClient, userId: string, batch: ReaderBatch): Promise<IngestResult> {
  const { data: cur } = await client
    .from('reader_threads')
    .select('last_ts, recent_hashes')
    .eq('user_id', userId).eq('platform', batch.platform).eq('thread_id', batch.threadId)
    .maybeSingle()
  const seen = new Set<string>((cur?.recent_hashes as string[] | null) ?? [])
  const lastTs = (cur?.last_ts as string | null) ?? null

  const plan = planIngest(batch, seen, lastTs)
  if (plan.fresh.length === 0) return { ingested: 0, reason: 'nada nuevo' }

  const personId = await matchPersonId(client, userId, batch.threadName, batch.senderEmail)
  const observedAt = plan.latestTs ?? new Date().toISOString()
  const obsId = `obs_reader_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const summary = `Conversación de ${batch.platform} con ${batch.threadName || 'alguien'} · ${plan.fresh.length} mensaje(s) nuevos`
  const { error } = await client.from('observations').insert({
    id: obsId, user_id: userId, person_id: personId, capture_type: 'dm_conversation',
    data: { platform: batch.platform, source: 'reader', thread_name: batch.threadName, summary, text: plan.conversationText, message_count: plan.fresh.length },
    confidence: 'high', observed_at: observedAt, is_obsolete: false,
  })
  if (error) throw new Error(error.message)

  // Sustrato canónico: appendar los mensajes nuevos al hilo de la persona (si
  // se atribuyó a alguien). Emisor best-effort: el autor que matchea el nombre
  // del hilo es 'other'; el resto, 'user'. Dedupe idempotente por id. Best-effort:
  // no debe romper el ingest si falla.
  if (personId) {
    try {
      await appendChatMessages(client, {
        // `source` queda como trazabilidad del camino de captura; `platform` es
        // el canal real y es lo que entra al id. Sin esto, un mensaje de WhatsApp
        // capturado en vivo y el mismo mensaje traído por el export hasheaban
        // distinto y quedaban duplicados (29-jul-2026).
        userId, personId, source: 'reader', platform: batch.platform,
        messages: plan.fresh.map((m) => ({
          iso: m.ts ?? null,
          sender: namesLooselyMatch(m.author, batch.threadName) ? 'other' : 'user',
          authorName: m.author,
          content: m.text,
          isMedia: false,
        })),
      })
    } catch { /* best-effort */ }
  }

  const merged = [...seen, ...plan.newHashes].slice(-HASH_WINDOW)
  await client.from('reader_threads').upsert({
    user_id: userId, platform: batch.platform, thread_id: batch.threadId, thread_name: batch.threadName,
    last_ts: plan.latestTs ?? lastTs, recent_hashes: merged, last_ingested_at: new Date().toISOString(),
  }, { onConflict: 'user_id,platform,thread_id' })

  // `reader_heartbeats.last_data_at` — la OTRA MITAD del diagnóstico de silencio.
  // La migración 0175 la declaró diciendo "la actualiza el endpoint de ingesta" y
  // hasta el 30-jul-2026 NADIE la escribía: el único lugar del repo que la
  // mencionaba era el cron que la LEE, así que llegaba siempre en null y el
  // diagnóstico se quedaba con media señal. Acá se cierra ese contrato.
  //
  // Es un UPDATE, no un upsert: si la fila no existe todavía (extensión sin
  // latido) no hay que inventarla — una fila con latido nulo haría creer que el
  // canal reportó alguna vez. Best-effort: nunca puede tumbar una ingesta que ya
  // guardó los mensajes.
  try {
    await client.from('reader_heartbeats')
      .update({ last_data_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('channel', batch.platform)
  } catch { /* best-effort */ }

  return { ingested: plan.fresh.length, observationId: obsId, personId, personMatched: !!personId }
}
