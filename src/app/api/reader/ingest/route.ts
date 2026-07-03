// SIR V2 — POST /api/reader/ingest
//
// Ingesta de conversaciones leídas del navegador logueado (SIR Reader). El
// cliente (extensión MV3 sobre Teams, primero) manda deltas de UN hilo; acá
// corremos el núcleo puro (planIngest), persistimos una observación
// dm_conversation con lo NUEVO, la atribuimos a la persona por el nombre del
// hilo, y avanzamos el cursor incremental (reader_threads, mig 0119).
// Ver docs/READER_ARCHITECTURE.md.
//
// Auth: TOKEN secreto (no sesión), como /api/health/ingest. Mono-usuario.
//   Authorization: Bearer <token>  o  x-reader-token: <token>  == READER_INGEST_TOKEN
// user_id: READER_INGEST_USER_ID || HEALTH_INGEST_USER_ID || único profile.
//
// Cliente SERVICE ROLE (bypassa RLS) con user_id explícito. Idempotente por hash
// (planIngest dedup) → re-enviar el mismo batch no duplica.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { reportApiError } from '@/lib/observability/reportApiError'
import { planIngest, type ReaderBatch, type ReaderPlatform } from '@/lib/reader/ingest'
import { namesLooselyMatch } from '@/lib/people/nameMatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const HASH_WINDOW = 400 // mensajes sin ts recordados por hilo para dedup

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function readToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim()
  return req.headers.get('x-reader-token')?.trim() || null
}

async function resolveUserId(admin: SupabaseClient): Promise<{ userId: string } | { error: string }> {
  const explicit = (process.env.READER_INGEST_USER_ID || process.env.HEALTH_INGEST_USER_ID)?.trim()
  if (explicit) return { userId: explicit }
  const { data, error } = await admin.from('profiles').select('id').limit(2)
  if (error) return { error: `No pude leer profiles: ${error.message}` }
  const rows = (data ?? []) as Array<{ id: string }>
  if (rows.length === 1) return { userId: rows[0].id }
  return { error: 'Seteá READER_INGEST_USER_ID con el user id de Aaron.' }
}

const VALID_PLATFORMS: ReadonlySet<string> = new Set(['teams', 'slack', 'linkedin', 'instagram', 'facebook', 'other'])

function parseBatch(x: unknown): ReaderBatch | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const platform = typeof o.platform === 'string' && VALID_PLATFORMS.has(o.platform) ? (o.platform as ReaderPlatform) : null
  const threadId = typeof o.threadId === 'string' ? o.threadId.trim() : ''
  const threadName = typeof o.threadName === 'string' ? o.threadName.trim() : ''
  if (!platform || !threadId || !Array.isArray(o.messages)) return null
  const messages = (o.messages as unknown[])
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => ({
      author: typeof m.author === 'string' ? m.author : '',
      text: typeof m.text === 'string' ? m.text : '',
      ts: typeof m.ts === 'string' ? m.ts : null,
    }))
  return { platform, threadId, threadName, messages }
}

/** Atribuye la persona por el nombre del hilo (match laxo). Solo si hay UNA. */
async function matchPersonId(admin: SupabaseClient, userId: string, threadName: string): Promise<string | null> {
  if (!threadName) return null
  try {
    const { data } = await admin.from('people').select('id, name, alias').eq('user_id', userId).limit(2000)
    const hits = ((data ?? []) as Array<{ id: string; name: string; alias: string | null }>).filter(
      (p) => namesLooselyMatch(threadName, p.name) || (p.alias ? namesLooselyMatch(threadName, p.alias) : false),
    )
    return hits.length === 1 ? hits[0].id : null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const expected = process.env.READER_INGEST_TOKEN?.trim()
  if (!expected) return errorJson(500, 'READER_INGEST_TOKEN no configurado en el server')
  const token = readToken(req)
  if (!token || !safeEqual(token, expected)) return errorJson(401, 'Token inválido')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return errorJson(500, 'Supabase no configurado en el server')
  const admin = createClient(url, key, { auth: { persistSession: false } })

  const resolved = await resolveUserId(admin)
  if ('error' in resolved) return errorJson(500, resolved.error)
  const userId = resolved.userId

  let body: unknown
  try { body = await req.json() } catch { return errorJson(400, 'JSON inválido') }
  const batch = parseBatch(body)
  if (!batch) return errorJson(400, 'Body inválido', 'Se esperaba { platform, threadId, threadName, messages[] }')

  try {
    // 1. Cursor del hilo (seen + lastTs).
    const { data: cur } = await admin
      .from('reader_threads')
      .select('last_ts, recent_hashes')
      .eq('user_id', userId).eq('platform', batch.platform).eq('thread_id', batch.threadId)
      .maybeSingle()
    const seen = new Set<string>((cur?.recent_hashes as string[] | null) ?? [])
    const lastTs = (cur?.last_ts as string | null) ?? null

    // 2. Núcleo puro.
    const plan = planIngest(batch, seen, lastTs)
    if (plan.fresh.length === 0) {
      return NextResponse.json({ ingested: 0, reason: 'nada nuevo' })
    }

    // 3. Observación dm_conversation con lo nuevo, atribuida a la persona.
    const personId = await matchPersonId(admin, userId, batch.threadName)
    const observedAt = plan.latestTs ?? new Date().toISOString()
    const obsId = `obs_reader_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const summary = `Conversación de ${batch.platform} con ${batch.threadName || 'alguien'} · ${plan.fresh.length} mensaje(s) nuevos`
    const { error: obsErr } = await admin.from('observations').insert({
      id: obsId,
      user_id: userId,
      person_id: personId,
      capture_type: 'dm_conversation',
      data: { platform: batch.platform, source: 'reader', thread_name: batch.threadName, summary, text: plan.conversationText, message_count: plan.fresh.length },
      confidence: 'high',
      observed_at: observedAt,
      is_obsolete: false,
    })
    if (obsErr) return errorJson(500, 'No pude guardar la observación', obsErr.message)

    // 4. Avanzar el cursor (cap de hashes recordados).
    const merged = [...seen, ...plan.newHashes].slice(-HASH_WINDOW)
    const nextTs = plan.latestTs ?? lastTs
    await admin.from('reader_threads').upsert({
      user_id: userId, platform: batch.platform, thread_id: batch.threadId, thread_name: batch.threadName,
      last_ts: nextTs, recent_hashes: merged, last_ingested_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform,thread_id' })

    return NextResponse.json({ ingested: plan.fresh.length, observationId: obsId, personId, personMatched: !!personId })
  } catch (e) {
    reportApiError(e)
    return errorJson(500, 'Falló la ingesta', (e instanceof Error ? e.message : String(e)).slice(0, 200))
  }
}
