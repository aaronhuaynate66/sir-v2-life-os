// SIR V2 — GET /api/reader/status
//
// Estado de la ingesta del SIR Reader (extensión que lee WhatsApp/Teams/Outlook
// desde otra PC y postea a /api/reader/ingest). Responde "¿está entrando data,
// de qué, cuándo, y se cruzó con alguien?" — para no estar ciegos. User-scoped.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ThreadRow { platform: string; thread_name: string | null; last_ts: string | null; last_ingested_at: string | null }
interface ObsRow { observed_at: string | null; person_id: string | null; data: { platform?: string; source?: string; thread_name?: string; message_count?: number } | null }

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  // Hilos que el reader viene siguiendo (con su cursor incremental).
  const { data: threadsRaw } = await supabase
    .from('reader_threads')
    .select('platform, thread_name, last_ts, last_ingested_at')
    .eq('user_id', userId)
    .order('last_ingested_at', { ascending: false })
    .limit(200)
  const threads = (threadsRaw ?? []) as ThreadRow[]

  // Observaciones creadas por el reader (dm_conversation con source='reader').
  const { data: obsRaw } = await supabase
    .from('observations')
    .select('observed_at, person_id, data')
    .eq('user_id', userId)
    .eq('capture_type', 'dm_conversation')
    .order('observed_at', { ascending: false })
    .limit(500)
  const readerObs = ((obsRaw ?? []) as ObsRow[]).filter((o) => o.data?.source === 'reader')

  // Agregados por plataforma.
  const byPlatform: Record<string, { threads: number; observations: number; messages: number; matched: number; lastIngestAt: string | null }> = {}
  for (const t of threads) {
    const p = (byPlatform[t.platform] ??= { threads: 0, observations: 0, messages: 0, matched: 0, lastIngestAt: null })
    p.threads += 1
    if (t.last_ingested_at && (!p.lastIngestAt || t.last_ingested_at > p.lastIngestAt)) p.lastIngestAt = t.last_ingested_at
  }
  for (const o of readerObs) {
    const plat = o.data?.platform ?? 'desconocido'
    const p = (byPlatform[plat] ??= { threads: 0, observations: 0, messages: 0, matched: 0, lastIngestAt: null })
    p.observations += 1
    p.messages += o.data?.message_count ?? 0
    if (o.person_id) p.matched += 1
  }

  // Mensajes canónicos que el reader appendeó (source='reader') — total.
  let readerChatMessages = 0
  try {
    const { count } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', 'reader')
    readerChatMessages = count ?? 0
  } catch { /* tabla puede no existir en algún entorno */ }

  const recent = readerObs.slice(0, 25).map((o) => ({
    observedAt: o.observed_at,
    platform: o.data?.platform ?? '?',
    threadName: o.data?.thread_name ?? '(sin nombre)',
    messageCount: o.data?.message_count ?? 0,
    matched: !!o.person_id,
  }))

  return NextResponse.json({
    threads: threads.map((t) => ({
      platform: t.platform,
      threadName: t.thread_name ?? '(sin nombre)',
      lastIngestAt: t.last_ingested_at,
      lastMessageAt: t.last_ts,
    })),
    byPlatform,
    recent,
    totals: {
      threads: threads.length,
      readerObservations: readerObs.length,
      readerChatMessages,
    },
  })
}
