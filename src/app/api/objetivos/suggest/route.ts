// SIR V2 — POST /api/objetivos/suggest
// Recibe { text } (relato libre) y pide a la IA un objetivo estructurado.
// NO persiste: la propuesta prefilla el formulario para confirmar/editar.
// Espeja /api/relaciones/intake-suggest.

import Anthropic from '@anthropic-ai/sdk'
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

const MODEL_ID = 'claude-sonnet-4-5-20250929'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: unknown
  try { body = await req.json() } catch { return errorJson(400, 'JSON inválido en el body') }
  const text = (body as { text?: unknown })?.text
  if (typeof text !== 'string' || text.trim().length < 8) {
    return errorJson(400, 'Texto insuficiente', 'Contale a SIR de qué se trata el objetivo (mínimo una frase).')
  }

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })

  let raw = ''
  try {
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 800,
      system: GOAL_SUGGEST_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildGoalSuggestInput(text) }],
    })
    const tb = msg.content.find((b) => b.type === 'text')
    raw = tb && tb.type === 'text' ? tb.text : ''
  } catch (e) {
    reportApiError(e)
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo', m.slice(0, 300))
  }

  const suggestion = parseGoalSuggestion(raw)
  if (!suggestion) {
    return errorJson(422, 'No pude armar un objetivo del texto', 'Probá contándolo con un poco más de detalle.')
  }
  return NextResponse.json({ suggestion }, { status: 200 })
}
