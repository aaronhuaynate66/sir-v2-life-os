// SIR V2 — POST /api/capture/note (captura de NOTA libre — autodetect)
//
// Recibe texto libre (una nota conversacional sobre una persona) y extrae datos
// estructurados + un resumen con Anthropic. No persiste: el cliente revisa y
// guarda (updatePerson + nota). Anti-invención (ver notePrompt).
//
// Body JSON: { text: string }
// Response 200: { extract: NoteExtract }

import { NextResponse, type NextRequest } from 'next/server'
import { complete, LlmError } from '@/lib/llm'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { NOTE_EXTRACT_SYSTEM_PROMPT, buildNoteInput, parseNoteExtract } from '@/lib/capture/note/notePrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
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
    return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
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

  try {
    const res = await complete({
      task: 'extract',
      sensitivity: 'third_party',
      system: NOTE_EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildNoteInput(text, todayInLima()) }],
      maxTokens: 600,
    }, { supabase, userId: authData.user.id })
    const extract = parseNoteExtract(res.text)
    if (!extract) {
      return errorJson(422, 'Sin datos en la nota', 'No encontré datos claros sobre la persona en esa nota.')
    }
    return NextResponse.json({ extract }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') {
      return errorJson(503, 'Extracción no disponible', 'No hay proveedor LLM configurado.')
    }
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo procesar la nota', detail)
  }
}
