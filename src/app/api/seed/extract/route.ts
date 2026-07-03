// SIR V2 — POST /api/seed/extract  (C1: texto crudo → JSON de seed batch)
//
// Recibe { text } (un relato, texto de un PDF, un perfil pegado) y devuelve
// { batch } con el formato de data/seed-batches/README.md. NO aplica nada: el
// cliente (/captura/batch) mete el batch en el textarea para que Aaron revise,
// haga dry-run y recién aplique. Session-auth, rate-limit 'generation', Sonnet,
// mismo pipeline tolerante que /api/reason (reintenta si el JSON falla).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { buildSeedExtractSystemPrompt, parseSeedExtractJson } from '@/lib/seed/extractPrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL_ID = 'claude-sonnet-4-5'
const MAX_TEXT = 20_000

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  const rl = await enforceRateLimit(supabase, auth.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: { text?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : ''
  if (!text) return errorJson(400, 'Pegá el texto a extraer')

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })
  const system = buildSeedExtractSystemPrompt()

  async function call(extra = ''): Promise<string> {
    const msg = await client.messages.create({
      model: MODEL_ID, max_tokens: 2500,
      system: extra ? `${system}\n\n${extra}` : system,
      messages: [{ role: 'user', content: `TEXTO:\n${text}` }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    return block && block.type === 'text' ? block.text : ''
  }

  let raw = ''
  try {
    raw = await call()
  } catch (e) {
    reportApiError(e, { route: 'seed/extract' })
    return errorJson(502, 'Falló la llamada a Claude', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let batch = parseSeedExtractJson(raw)
  if (!batch) {
    try { batch = parseSeedExtractJson(await call('CRÍTICO: devolvé SOLO el JSON, empezando con { y terminando con }.')) } catch { batch = null }
  }
  if (!batch) return errorJson(502, 'Claude devolvió formato inválido')

  return NextResponse.json({ batch })
}
