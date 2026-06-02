// SIR V2 — POST /api/objectives/smart (Hito A: helper "Hacer SMART")
//
// Recibe un objetivo en bruto (título + descripción? + categoría? + fecha?) y
// pide a Anthropic su definición SMART: target medible + baseline + por qué +
// fecha sugerida (si no había). NO persiste: devuelve la propuesta para que el
// usuario la revise/edite/acepte o descarte en la UI (review-before-save).
//
// Mismo patrón que /api/objectives/plan: auth → rate limit ('generation') →
// check ANTHROPIC_API_KEY → Anthropic → parser tolerante → JSON.
//
// Body JSON: { title, description?, category?, targetDate? }
// Response 200: { smart: { target, baseline?, why, suggestedTargetDate? } }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  OBJECTIVE_SMART_SYSTEM_PROMPT,
  buildSmartInput,
  parseSmart,
} from '@/lib/objectives/smartPrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Coherente con /plan: 60s (máx Hobby) para no arriesgar 504 si el LLM se
// demora. La salida es chica (~800 tokens), así que normalmente termina <15s.
export const maxDuration = 60

const MODEL_ID = 'claude-sonnet-4-5-20250929'

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
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
    return errorJson(400, 'Body JSON inválido')
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return errorJson(400, 'title requerido (string no vacío)')

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(
      503,
      'Generación no disponible',
      'Falta ANTHROPIC_API_KEY. Podés definir el objetivo SMART a mano igual.',
    )
  }

  const input = {
    title,
    description: typeof body.description === 'string' ? body.description : undefined,
    category: typeof body.category === 'string' ? body.category : undefined,
    targetDate: typeof body.targetDate === 'string' ? body.targetDate : undefined,
    today: todayIso(),
  }

  try {
    const client = new Anthropic({ maxRetries: 2 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 800,
      system: OBJECTIVE_SMART_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildSmartInput(input) }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const smart = parseSmart(text)
    if (!smart) {
      return errorJson(502, 'Propuesta vacía del modelo', 'No se pudo extraer una definición SMART. Reintentá.')
    }
    return NextResponse.json({ smart }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo generar la definición SMART', detail)
  }
}
