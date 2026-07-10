// SIR V2 — POST /api/email/ingest
//
// Ingesta PASIVA de correo scrapeado desde Outlook Web (OWA) por la extensión
// SIR Reader, para cuando NO hay acceso admin a Azure/Graph. Recibe los correos
// VISIBLES del inbox (remitente, asunto, fecha, preview) + el cuerpo del correo
// abierto, los normaliza a la shape de Graph (lib/email/normalize) y los persiste
// con el MISMO backend de correo (ingestEmailMessages → ingestReaderBatch →
// observación dm_conversation, dedup por hash). NO toca el flujo Graph existente:
// es una FUENTE nueva para el mismo pipeline.
//
// Auth: TOKEN secreto (no sesión), mismo patrón que /api/reader/ingest. Mono-
// usuario. Acepta EMAIL_INGEST_TOKEN, y como la extensión usa un solo token,
// también READER_INGEST_TOKEN.
//   Authorization: Bearer <token>  o  x-reader-token: <token>
//
// Idempotente (normalize colapsa re-scrapes por dedupKey + reader_threads dedup
// por hash) y fail-open. Devuelve { ingested, skipped }.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { reportApiError } from '@/lib/observability/reportApiError'
import { normalizeScrapedEmails } from '@/lib/email/normalize'
import { ingestEmailMessages } from '@/lib/email/ingest'

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

function expectedToken(): string | null {
  return (process.env.EMAIL_INGEST_TOKEN || process.env.READER_INGEST_TOKEN)?.trim() || null
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

export async function POST(req: NextRequest) {
  const expected = expectedToken()
  if (!expected) return errorJson(500, 'EMAIL_INGEST_TOKEN (o READER_INGEST_TOKEN) no configurado en el server')
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
  const rawMessages = body && typeof body === 'object' ? (body as { messages?: unknown }).messages : null
  if (!Array.isArray(rawMessages)) return errorJson(400, 'Body inválido', 'Se esperaba { messages: [...] }')

  // Normaliza + colapsa re-scrapes por dedupKey (PURO). `received` es cuántos
  // correos únicos entraron; el pipeline (reader_threads) hace el dedup real.
  const normalized = normalizeScrapedEmails(rawMessages)
  const received = normalized.length

  try {
    const { ingested } = await ingestEmailMessages(admin, userId, normalized, { route: 'email/ingest' })
    return NextResponse.json({ ingested, skipped: Math.max(0, received - ingested) })
  } catch (e) {
    reportApiError(e, { route: 'email/ingest' })
    return errorJson(500, 'Falló la ingesta', (e instanceof Error ? e.message : String(e)).slice(0, 200))
  }
}
