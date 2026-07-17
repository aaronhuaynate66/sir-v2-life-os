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

import { complete, LlmError } from '@/lib/llm'
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
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reintenta.')

  let body: { title?: unknown; description?: unknown; force?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1500) : ''
  if (!title && !description) return errorJson(400, 'Cuéntame qué estás por decidir')
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

  const userId = auth.user.id
  const user = buildPremortemUserPrompt({ title, description })

  // LLM vía capa llm/ (router + fallback + telemetría). tier capable:
  // premortem de una decisión de Aaron (AI_USAGE_AUDIT bucket a).
  async function call(extra = ''): Promise<string> {
    const res = await complete(
      { task: 'decision_premortem', tier: 'capable', sensitivity: 'self', maxTokens: 900,
        system: extra ? `${PREMORTEM_SYSTEM}\n\n${extra}` : PREMORTEM_SYSTEM,
        messages: [{ role: 'user', content: user }] },
      { supabase, userId },
    )
    return res.text
  }

  let raw = ''
  try { raw = await call() } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') return errorJson(500, 'No hay proveedor LLM configurado en el server')
    return errorJson(502, 'Falló la llamada al modelo', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let parsed: unknown = null
  try { parsed = JSON.parse(stripFences(raw)) } catch { parsed = null }
  let premortem = parsePremortem(parsed)
  if (!premortem) {
    try {
      parsed = JSON.parse(stripFences(await call('CRÍTICO: devuelve SOLO el JSON, empezando con { y terminando con }.')))
      premortem = parsePremortem(parsed)
    } catch { premortem = null }
  }
  if (!premortem) return errorJson(502, 'No pude armar el premortem')

  // Cachear (idempotente por user+día+hash). Fail-open.
  await writeDailyCache(supabase, auth.user.id, 'premortem', cacheKey, { premortem })
  return NextResponse.json({ premortem, cached: false })
}
