// SIR V2 — POST /api/objetivos/suggest
// Recibe { text } (relato libre) y pide a la IA un objetivo estructurado.
// NO persiste: la propuesta prefilla el formulario para confirmar/editar.
// Espeja /api/relaciones/intake-suggest.

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  GOAL_SUGGEST_SYSTEM_PROMPT,
  buildGoalSuggestInput,
  parseGoalSuggestion,
} from '@/lib/objetivos/goalSuggest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reintenta.')

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: unknown
  try { body = await req.json() } catch { return errorJson(400, 'JSON inválido en el body') }
  const text = (body as { text?: unknown })?.text
  if (typeof text !== 'string' || text.trim().length < 8) {
    return errorJson(400, 'Texto insuficiente', 'Cuéntale a SIR de qué se trata el objetivo (mínimo una frase).')
  }

  // LLM vía capa llm/ (router + fallback + telemetría). tier balanced:
  // estructura un objetivo de Aaron desde relato libre.
  let raw = ''
  try {
    const res = await complete(
      { task: 'goal_suggest', tier: 'balanced', sensitivity: 'self', maxTokens: 800,
        system: GOAL_SUGGEST_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildGoalSuggestInput(text) }] },
      { supabase, userId: authData.user.id },
    )
    raw = res.text
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') return errorJson(500, 'No hay proveedor LLM configurado en el server')
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo', m.slice(0, 300))
  }

  const suggestion = parseGoalSuggestion(raw)
  if (!suggestion) {
    return errorJson(422, 'No pude armar un objetivo del texto', 'Prueba contándolo con un poco más de detalle.')
  }
  return NextResponse.json({ suggestion }, { status: 200 })
}
