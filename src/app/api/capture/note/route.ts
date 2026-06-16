// SIR V2 — POST /api/capture/note (captura de NOTA libre — autodetect)
//
// Recibe texto libre (una nota conversacional sobre una persona) y extrae datos
// estructurados + un resumen con Anthropic. No persiste: el cliente revisa y
// guarda (updatePerson + nota). Anti-invención (ver notePrompt).
//
// Body JSON: { text: string }
// Response 200: { extract: NoteExtract }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { NOTE_EXTRACT_SYSTEM_PROMPT, buildNoteInput, parseNoteExtract } from '@/lib/capture/note/notePrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_TEXT = 6000

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

/** 'YYYY-MM-DD' de hoy en TZ Lima — para resolver fechas relativas de la nota. */
function todayInLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : ''
  if (text.length < 3) return errorJson(400, 'text requerido (texto no vacio)')

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(503, 'Extracción no disponible', 'Falta ANTHROPIC_API_KEY.')
  }

  try {
    const client = new Anthropic({ maxRetries: 2 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 600,
      system: NOTE_EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildNoteInput(text, todayInLima()) }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const extract = parseNoteExtract(raw)
    if (!extract) {
      return errorJson(422, 'Sin datos en la nota', 'No encontré datos claros sobre la persona en esa nota.')
    }
    return NextResponse.json({ extract }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo procesar la nota', detail)
  }
}
