// SIR V2 — POST /api/capture/whatsapp-export/messages
//
// Appenda mensajes al SUSTRATO canónico del chat (chat_messages, mig 0141). El
// cliente manda el delta de mensajes ya parseados (texto completo, sin clipear)
// y acá se persisten con dedupe idempotente por id. Independiente de la
// interpretación/LLM: el sustrato se llena aunque la síntesis falle o el usuario
// no confirme la observación. El cliente lo llama por lotes (best-effort).
//
// Body JSON: { person_id, source?, messages: [{ iso, sender, authorName, content, isMedia }] }
// Auth + ownership de la persona requeridos. RLS asegura el aislamiento por dueño.

import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { appendChatMessages, type ChatMessageInput } from '@/lib/chat-messages/append'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const MAX_MESSAGES = 5000
const VALID_SOURCES = new Set(['whatsapp', 'reader', 'channel'])

function errorJson(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status })
}

function sanitizeMessage(raw: unknown): ChatMessageInput | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const content = typeof o.content === 'string' ? o.content : ''
  const isMedia = o.isMedia === true
  if (content.trim().length === 0 && !isMedia) return null
  return {
    iso: typeof o.iso === 'string' && o.iso.length >= 10 ? o.iso : null,
    sender: o.sender === 'user' ? 'user' : 'other',
    authorName: typeof o.authorName === 'string' ? o.authorName : null,
    content,
    isMedia,
  }
}

/** GET ?person_id= → cursor del sustrato: fecha del ÚLTIMO mensaje ya guardado
 *  en chat_messages para esa persona. El cliente lo usa para mandar solo el delta
 *  nuevo en la próxima subida (en vez de reenviar el hilo entero). null = sustrato
 *  vacío para esa persona → mandar todo (backfill). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    const user = authData?.user
    if (authError || !user) return errorJson(401, 'No autenticado')

    const personId = req.nextUrl.searchParams.get('person_id')?.trim()
    if (!personId) return errorJson(400, 'Falta person_id')

    const { data } = await supabase
      .from('chat_messages')
      .select('sent_at')
      .eq('user_id', user.id).eq('person_id', personId)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return NextResponse.json({ lastISO: (data?.sent_at as string | null) ?? null })
  } catch (e) {
    reportApiError(e, { route: 'capture/whatsapp-export/messages#GET' })
    return errorJson(500, e instanceof Error ? e.message : 'Error inesperado')
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    const user = authData?.user
    if (authError || !user) return errorJson(401, 'No autenticado')

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return errorJson(400, 'Body inválido')

    const personId = typeof body.person_id === 'string' ? body.person_id.trim() : ''
    if (!personId) return errorJson(400, 'Falta person_id')

    // Ownership: la persona tiene que ser del usuario.
    const { data: prow } = await supabase
      .from('people')
      .select('id')
      .eq('id', personId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!prow) return errorJson(404, 'Persona no encontrada')

    const source = typeof body.source === 'string' && VALID_SOURCES.has(body.source) ? body.source : 'whatsapp'
    const messages = Array.isArray(body.messages)
      ? body.messages.slice(0, MAX_MESSAGES).map(sanitizeMessage).filter((m): m is ChatMessageInput => m !== null)
      : []

    if (messages.length === 0) return NextResponse.json({ appended: 0 })

    const appended = await appendChatMessages(supabase, { userId: user.id, personId, source, messages })
    return NextResponse.json({ appended })
  } catch (e) {
    reportApiError(e, { route: 'capture/whatsapp-export/messages' })
    return errorJson(500, e instanceof Error ? e.message : 'Error inesperado')
  }
}
