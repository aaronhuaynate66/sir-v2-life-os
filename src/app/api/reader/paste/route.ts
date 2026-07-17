// SIR V2 — POST /api/reader/paste  (SIR Reader, camino SIMPLE sin extensión)
//
// Aaron copia un hilo de Teams (o cualquier chat) y lo pega. Parseamos el texto
// (best-effort) → batch → mismo núcleo que /api/reader/ingest (planIngest +
// observación + cursor). Session-auth: es Aaron logueado en la app; RLS protege.
// Idempotente por hash: re-pegar el mismo hilo solo suma lo nuevo.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { parsePastedConversation } from '@/lib/reader/parsePaste'
import { ingestReaderBatch } from '@/lib/reader/persist'
import type { ReaderPlatform } from '@/lib/reader/ingest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const VALID_PLATFORMS: ReadonlySet<string> = new Set(['teams', 'slack', 'linkedin', 'instagram', 'facebook', 'other'])

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

/** Id estable del hilo por (plataforma + persona), así re-pegar acumula. */
function threadIdFor(platform: string, threadName: string): string {
  const slug = threadName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'hilo'
  return `paste:${platform}:${slug}`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')

  let body: { platform?: unknown; threadName?: unknown; text?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }

  const platform = (typeof body.platform === 'string' && VALID_PLATFORMS.has(body.platform) ? body.platform : 'teams') as ReaderPlatform
  const threadName = typeof body.threadName === 'string' ? body.threadName.trim().slice(0, 120) : ''
  const text = typeof body.text === 'string' ? body.text : ''
  if (!threadName) return errorJson(400, 'Decime con quién es la conversación (nombre).')
  if (!text.trim()) return errorJson(400, 'Pega la conversación.')

  const messages = parsePastedConversation(text)
  if (messages.length === 0) return errorJson(400, 'No pude leer mensajes en lo que pegaste.')

  try {
    const result = await ingestReaderBatch(supabase, auth.user.id, {
      platform, threadId: threadIdFor(platform, threadName), threadName, messages,
    })
    return NextResponse.json(result)
  } catch (e) {
    reportApiError(e)
    return errorJson(500, 'No pude guardar la conversación', (e instanceof Error ? e.message : String(e)).slice(0, 200))
  }
}
