// SIR V2 — POST /api/alignment/infer-links (Etapa 4: inferencia de vínculo)
//
// On-demand / opt-in: dado el texto de UN objetivo suelto + la lista de nombres
// de los contactos reales del usuario, pide a Sonnet que SUGIERA a qué dominio y
// a cuáles de esas personas se refiere. NO persiste: la sugerencia prefilla una
// selección editable que el usuario confirma en el cliente (no auto-aplicado).
//
// Anti-invención: el parse filtra cualquier nombre que no esté en la lista de
// candidatos (guardrail duro). Sin ANTHROPIC_API_KEY → 503 (la feature es
// opcional). Espeja el patrón de /api/objetivos/suggest.
//
// Body JSON: { title, description?, target?, why?, candidateNames: string[] }
// Response 200: { inference: { personNames, category, reasoning, confident } }

import { NextResponse, type NextRequest } from 'next/server'
import { complete, LlmError } from '@/lib/llm'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  GOAL_INFER_SYSTEM_PROMPT,
  buildGoalInferInput,
  parseGoalInference,
} from '@/lib/alignment/goalInfer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorJson(400, 'JSON inválido en el body')
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (title.length < 2) return errorJson(400, 'title requerido (string no vacío)')

  const candidateNames = Array.isArray(body.candidateNames)
    ? (body.candidateNames as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, 200)
    : []

  const goal = {
    title,
    description: typeof body.description === 'string' ? body.description : undefined,
    target: typeof body.target === 'string' ? body.target : undefined,
    why: typeof body.why === 'string' ? body.why : undefined,
  }

  let raw = ''
  try {
    const res = await complete({
      task: 'extract',
      sensitivity: 'third_party',
      system: GOAL_INFER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildGoalInferInput(goal, candidateNames) }],
      maxTokens: 500,
    }, { supabase, userId: authData.user.id })
    raw = res.text
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') {
      return errorJson(503, 'Sugerencia no disponible', 'No hay proveedor LLM configurado. Podés vincular personas a mano igual.')
    }
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo', m.slice(0, 300))
  }

  const inference = parseGoalInference(raw, candidateNames)
  if (!inference) {
    return errorJson(422, 'No pude leer una sugerencia', 'Reintentá en unos segundos.')
  }
  return NextResponse.json({ inference }, { status: 200 })
}
