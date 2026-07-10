// SIR V2 — POST /api/self/coherencia (Narrative Intelligence, E5)
//
// Recibe la SÍNTESIS de coherencia declarado ↔ hecho ya computada client-side
// (coherenceSummaryLine, determinística) y pide a Anthropic una reflexión breve
// y REFLEXIVA. El LLM no calcula la coherencia: sólo reformula los números
// provistos. Por eso se apoya en datos, no en invención.
//
// Sin síntesis legible → 422. Sin ANTHROPIC_API_KEY → 503 (la reflexión es
// opcional; el veredicto determinístico se ve igual sin ella).
//
// Body JSON: { coherence: string, anchor?: string, identity?: string }
// Response 200: { insight: string }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  COHERENCE_NARRATIVE_SYSTEM_PROMPT,
  buildCoherenceInput,
  parseCoherenceNarrative,
} from '@/lib/self/coherencePrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_COHERENCE_CHARS = 600

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
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

  const coherence =
    typeof body.coherence === 'string' ? body.coherence.trim().slice(0, MAX_COHERENCE_CHARS) : ''
  const anchor = typeof body.anchor === 'string' ? body.anchor.trim().slice(0, 200) : null
  const identity = typeof body.identity === 'string' ? body.identity.trim().slice(0, 300) : null

  if (!coherence) {
    return errorJson(
      422,
      'Sin coherencia que reflexionar',
      'Necesito una síntesis de tu foco declarado ↔ hecho para reflexionar. Se va formando a medida que marcás prioridades y completás pasos.',
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(
      503,
      'Reflexión no disponible',
      'Falta ANTHROPIC_API_KEY. Tu coherencia se ve igual sin la reflexión.',
    )
  }

  try {
    const client = new Anthropic({ maxRetries: 2 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 400,
      system: COHERENCE_NARRATIVE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildCoherenceInput({ coherence, anchor, identity }) }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const insight = parseCoherenceNarrative(text)
    if (!insight) {
      return errorJson(502, 'Respuesta vacía del modelo', 'Reintentá en unos segundos.')
    }
    return NextResponse.json({ insight }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo generar la reflexión', detail)
  }
}
