// SIR V2 — POST /api/verificar/deep  (16·M3: deep-scan de manipulación con IA)
//
// Recibe { message }. Pide a Sonnet identificar cuáles de las 23 técnicas del
// catálogo tiene el mensaje, con cita y explicación — cubre las semánticas que el
// regex no puede. DEFENSA: nombra la movida, no acusa. Session-auth, rate-limit
// 'generation', 1 retry si el JSON falla. NO escribe ni guarda el texto.
//
// PRIVACIDAD: a diferencia del scan instantáneo (client-side, el texto no sale del
// navegador), este modo SÍ manda el mensaje al modelo. La UI lo avisa antes.

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { DEEP_SCAN_SYSTEM_PROMPT, buildDeepScanUserContent, parseDeepScan } from '@/lib/verificar/deepScan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 40

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reintenta.')

  const rl = await enforceRateLimit(supabase, auth.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: { message?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 6000) : ''
  if (!message) return errorJson(400, 'Pega el mensaje a analizar')

  const userId = auth.user.id
  const user = buildDeepScanUserContent(message)

  // LLM vía capa llm/ (router + fallback + telemetría). tier balanced:
  // deep-scan defensivo del mensaje de Aaron (AI_USAGE_AUDIT bucket a).
  async function call(extra = ''): Promise<string> {
    const res = await complete(
      { task: 'verificar_deep', tier: 'balanced', sensitivity: 'self', maxTokens: 1200,
        system: extra ? `${DEEP_SCAN_SYSTEM_PROMPT}\n\n${extra}` : DEEP_SCAN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: user }] },
      { supabase, userId },
    )
    return res.text
  }

  let raw = ''
  try {
    raw = await call()
  } catch (e) {
    reportApiError(e, { route: 'verificar/deep' })
    if (e instanceof LlmError && e.code === 'no_provider') return errorJson(500, 'No hay proveedor LLM configurado en el server')
    return errorJson(502, 'Falló la llamada al modelo', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let result = parseDeepScan(raw)
  if (!result) {
    try { result = parseDeepScan(await call('CRÍTICO: devuelve SOLO el JSON, empezando con { y terminando con }.')) } catch { result = null }
  }
  if (!result) return errorJson(502, 'Claude devolvió formato inválido')

  return NextResponse.json({ result })
}
