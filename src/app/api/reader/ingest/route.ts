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
import { type ReaderBatch, type ReaderPlatform } from '@/lib/reader/ingest'
import { ingestReaderBatch } from '@/lib/reader/persist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

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

const VALID_PLATFORMS: ReadonlySet<string> = new Set(['teams', 'slack', 'whatsapp', 'linkedin', 'instagram', 'facebook', 'other'])

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
  // `tsKind` dice si los ts vienen como instante REAL o ya en hora de pared de Lima.
  // Default 'wall' a propósito: es lo que hacen los readers que ya andaban, y
  // convertir dos veces deja el mensaje 10 h corrido — peor que el bug original.
  const tsKind = o.tsKind === 'instant' ? 'instant' as const : 'wall' as const
  return { platform, threadId, threadName, tsKind, messages }
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
    const result = await ingestReaderBatch(admin, userId, batch)
    return NextResponse.json(result)
  } catch (e) {
    reportApiError(e)
    return errorJson(500, 'Falló la ingesta', (e instanceof Error ? e.message : String(e)).slice(0, 200))
  }
}
