// SIR V2 — SIR Reader: persistencia compartida de un batch (núcleo del ingest).
//
// Lo usan los dos caminos: /api/reader/ingest (token, para la extensión) y
// /api/reader/paste (sesión, pegar conversación). Carga el cursor del hilo →
// planIngest (puro, idempotente) → persiste UNA observación dm_conversation con
// lo nuevo, atribuida a la persona por el nombre del hilo → avanza el cursor.

import type { SupabaseClient } from '@supabase/supabase-js'

import { planIngest, type ReaderBatch } from './ingest'
import { namesLooselyMatch } from '@/lib/people/nameMatch'

const HASH_WINDOW = 400

export interface IngestResult {
  ingested: number
  observationId?: string
  personId?: string | null
  personMatched?: boolean
  reason?: string
}

/** Atribuye la persona por el nombre del hilo (match laxo). Solo si hay UNA. */
async function matchPersonId(client: SupabaseClient, userId: string, threadName: string): Promise<string | null> {
  if (!threadName) return null
  try {
    const { data } = await client.from('people').select('id, name, alias').eq('user_id', userId).limit(2000)
    const hits = ((data ?? []) as Array<{ id: string; name: string; alias: string | null }>).filter(
      (p) => namesLooselyMatch(threadName, p.name) || (p.alias ? namesLooselyMatch(threadName, p.alias) : false),
    )
    return hits.length === 1 ? hits[0].id : null
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

  const personId = await matchPersonId(client, userId, batch.threadName)
  const observedAt = plan.latestTs ?? new Date().toISOString()
  const obsId = `obs_reader_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const summary = `Conversación de ${batch.platform} con ${batch.threadName || 'alguien'} · ${plan.fresh.length} mensaje(s) nuevos`
  const { error } = await client.from('observations').insert({
    id: obsId, user_id: userId, person_id: personId, capture_type: 'dm_conversation',
    data: { platform: batch.platform, source: 'reader', thread_name: batch.threadName, summary, text: plan.conversationText, message_count: plan.fresh.length },
    confidence: 'high', observed_at: observedAt, is_obsolete: false,
  })
  if (error) throw new Error(error.message)

  const merged = [...seen, ...plan.newHashes].slice(-HASH_WINDOW)
  await client.from('reader_threads').upsert({
    user_id: userId, platform: batch.platform, thread_id: batch.threadId, thread_name: batch.threadName,
    last_ts: plan.latestTs ?? lastTs, recent_hashes: merged, last_ingested_at: new Date().toISOString(),
  }, { onConflict: 'user_id,platform,thread_id' })

  return { ingested: plan.fresh.length, observationId: obsId, personId, personMatched: !!personId }
}
