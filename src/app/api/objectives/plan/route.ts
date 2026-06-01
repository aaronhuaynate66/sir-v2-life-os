// SIR V2 — POST /api/objectives/plan (Hito 3: "Generar plan con IA")
//
// Recibe UN objetivo (título + descripción? + categoría? + fecha objetivo?) y
// pide a Anthropic un PLAN de pasos concretos, ordenados y con fechas sugeridas
// hasta la fecha objetivo. NO persiste nada: devuelve el plan propuesto para
// que el usuario lo revise/edite/acepte o descarte en la UI (review-before-save).
//
// Mismo patrón que /api/alignment/narrative: auth → rate limit ('generation')
// → check ANTHROPIC_API_KEY → Anthropic → parser tolerante → JSON.
//
// Body JSON: { title, description?, category?, targetDate? }
// Response 200: { steps: [{ title, description?, targetDate? }] }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  OBJECTIVE_PLAN_SYSTEM_PROMPT,
  buildPlanInput,
  parseObjectivePlan,
} from '@/lib/objectives/planPrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-sonnet-4-5-20250929'

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

/** Hoy en date-only ISO (server-side; el plan no necesita TZ exacta del cliente). */
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
      'Falta ANTHROPIC_API_KEY. Podés agregar los pasos a mano igual.',
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
      max_tokens: 1200,
      system: OBJECTIVE_PLAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPlanInput(input) }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const steps = parseObjectivePlan(text)
    if (steps.length === 0) {
      return errorJson(502, 'Plan vacío del modelo', 'No se pudo extraer un plan. Reintentá en unos segundos.')
    }
    return NextResponse.json({ steps }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo generar el plan', detail)
  }
}
