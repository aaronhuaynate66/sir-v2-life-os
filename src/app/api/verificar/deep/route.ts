// SIR V2 — POST /api/verificar/deep  (16·M3: deep-scan de manipulación con IA)
//
// Recibe { message }. Pide a Sonnet identificar cuáles de las 23 técnicas del
// catálogo tiene el mensaje, con cita y explicación — cubre las semánticas que el
// regex no puede. DEFENSA: nombra la movida, no acusa. Session-auth, rate-limit
// 'generation', 1 retry si el JSON falla. NO escribe ni guarda el texto.
//
// PRIVACIDAD: a diferencia del scan instantáneo (client-side, el texto no sale del
// navegador), este modo SÍ manda el mensaje al modelo. La UI lo avisa antes.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { DEEP_SCAN_SYSTEM_PROMPT, buildDeepScanUserContent, parseDeepScan } from '@/lib/verificar/deepScan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 40

const MODEL_ID = 'claude-sonnet-4-5'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  const rl = await enforceRateLimit(supabase, auth.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: { message?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 6000) : ''
  if (!message) return errorJson(400, 'Pegá el mensaje a analizar')

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })
  const user = buildDeepScanUserContent(message)

  async function call(extra = ''): Promise<string> {
    const msg = await client.messages.create({
      model: MODEL_ID, max_tokens: 1200,
      system: extra ? `${DEEP_SCAN_SYSTEM_PROMPT}\n\n${extra}` : DEEP_SCAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    return block && block.type === 'text' ? block.text : ''
  }

  let raw = ''
  try {
    raw = await call()
  } catch (e) {
    reportApiError(e, { route: 'verificar/deep' })
    return errorJson(502, 'Falló la llamada a Claude', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let result = parseDeepScan(raw)
  if (!result) {
    try { result = parseDeepScan(await call('CRÍTICO: devolvé SOLO el JSON, empezando con { y terminando con }.')) } catch { result = null }
  }
  if (!result) return errorJson(502, 'Claude devolvió formato inválido')

  return NextResponse.json({ result })
}
