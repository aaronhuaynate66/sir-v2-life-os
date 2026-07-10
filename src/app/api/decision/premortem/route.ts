// SIR V2 — POST /api/decision/premortem  (Premortem estructurado, 14·M2)
//
// Espejo de /api/decision. Dada una decisión (title + description), asume que YA
// FRACASÓ en ~6 meses (método de Gary Klein) y devuelve MODOS DE FALLA
// estructurados: causa + probabilidad + señal temprana + mitigación. Session-auth,
// Sonnet directo, cache diaria por (día + hash del texto), rate-limit 'generation'.
//
// El prompt-builder y la validación de la salida viven en lib/decision/premortemPrompt
// (capa pura testeada). Acá sólo orquestamos: cache → rate-limit → Claude → parse.
//
// HONESTO: anticipación, no predicción. Nombra riesgos plausibles para activar el
// Sistema 2, no afirma que van a pasar.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { readDailyCache, writeDailyCache, decisionCacheKey } from '@/lib/ai-cache/dailyCache'
import { todayLimaKey } from '@/lib/dates/limaDay'
import { PREMORTEM_SYSTEM, buildPremortemUserPrompt, parsePremortem, type Premortem } from '@/lib/decision/premortemPrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 40

const MODEL_ID = 'claude-sonnet-4-5'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}
function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  let body: { title?: unknown; description?: unknown; force?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1500) : ''
  if (!title && !description) return errorJson(400, 'Contame qué estás por decidir')
  const force = body.force === true

  // Cache por (día + hash del texto), kind='premortem'. Chequeo antes del
  // rate-limit para no gastar cuota en un hit. Fail-open.
  const cacheKey = decisionCacheKey(todayLimaKey(), title, description)
  if (!force) {
    const cached = await readDailyCache<{ premortem: Premortem }>(
      supabase, auth.user.id, 'premortem', cacheKey,
    )
    if (cached) return NextResponse.json({ ...cached, cached: true })
  }

  const rl = await enforceRateLimit(supabase, auth.user.id, 'generation')
  if (!rl.ok) return rl.response

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })
  const user = buildPremortemUserPrompt({ title, description })

  async function call(extra = ''): Promise<string> {
    const msg = await client.messages.create({
      model: MODEL_ID, max_tokens: 900,
      system: extra ? `${PREMORTEM_SYSTEM}\n\n${extra}` : PREMORTEM_SYSTEM,
      messages: [{ role: 'user', content: user }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    return block && block.type === 'text' ? block.text : ''
  }

  let raw = ''
  try { raw = await call() } catch (e) {
    reportApiError(e)
    return errorJson(502, 'Falló la llamada a Claude', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let parsed: unknown = null
  try { parsed = JSON.parse(stripFences(raw)) } catch { parsed = null }
  let premortem = parsePremortem(parsed)
  if (!premortem) {
    try {
      parsed = JSON.parse(stripFences(await call('CRÍTICO: devolvé SOLO el JSON, empezando con { y terminando con }.')))
      premortem = parsePremortem(parsed)
    } catch { premortem = null }
  }
  if (!premortem) return errorJson(502, 'No pude armar el premortem')

  // Cachear (idempotente por user+día+hash). Fail-open.
  await writeDailyCache(supabase, auth.user.id, 'premortem', cacheKey, { premortem })
  return NextResponse.json({ premortem, cached: false })
}
