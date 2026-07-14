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

import { NextResponse, type NextRequest } from 'next/server'
import { complete, LlmError } from '@/lib/llm'
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

  try {
    const res = await complete({
      task: 'synthesis', sensitivity: 'self',
      system: COHERENCE_NARRATIVE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildCoherenceInput({ coherence, anchor, identity }) }],
      maxTokens: 400,
    }, { supabase, userId: authData.user.id })
    const insight = parseCoherenceNarrative(res.text)
    if (!insight) {
      return errorJson(502, 'Respuesta vacía del modelo', 'Reintentá en unos segundos.')
    }
    return NextResponse.json({ insight }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') {
      return errorJson(503, 'Reflexión no disponible', 'No hay proveedor LLM configurado. Tu coherencia se ve igual sin la reflexión.')
    }
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo generar la reflexión', detail)
  }
}
