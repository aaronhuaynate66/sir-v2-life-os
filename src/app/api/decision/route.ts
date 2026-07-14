// SIR V2 — POST /api/decision  (Evaluador de decisiones, A4)
//
// Aaron describe una decisión; el LLM la puntúa en las 7 dimensiones (docs/01)
// y el evaluador PURO (engines/decision) computa el ponderado + veredicto con el
// gate de reversibilidad. Devuelve el desglose. Session-auth, Sonnet, on-demand.

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { evaluateDecision, DECISION_DIMENSIONS, type DecisionDimension, type DecisionInput } from '@/engines/decision'
import { readDailyCache, writeDailyCache, decisionCacheKey } from '@/lib/ai-cache/dailyCache'
import { todayLimaKey } from '@/lib/dates/limaDay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 40

const SYSTEM = `Sos SIR V2, el sistema del usuario (Aaron). Evaluás una DECISIÓN en 7 dimensiones.
Para cada dimensión asigná un "score" de -2 (muy en contra) a +2 (muy a favor), y una "note" de 1 línea concreta.

Dimensiones:
- peace: ¿aumenta o reduce su paz mental? (meta-objetivo)
- values: ¿es coherente con sus VALORES y con quién quiere ser? (+2 muy alineado, -2 lo traiciona)
- biological: costo biológico / de energía (+2 la cuida, -2 la drena)
- financial: impacto en su estabilidad económica
- alignment: ¿lo acerca a sus objetivos? (+2 sí, -2 lo aleja)
- relational: impacto en sus relaciones clave
- timing: ¿es el momento correcto? (+2 sí, -2 mal momento)
- reversibility: ¿es reversible si se equivoca? (+2 totalmente reversible, -2 irreversible)

Devolvé EXCLUSIVAMENTE un JSON (sin prosa, sin fences), con las 7 claves:
{ "peace": {"score": n, "note": "…"}, "values": {...}, "biological": {...}, "financial": {...}, "alignment": {...}, "relational": {...}, "timing": {...}, "reversibility": {...} }
Empezá con { y terminá con }. Si una dimensión no aplica, poné score 0.`

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}
function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}

function toScores(x: unknown): DecisionInput['scores'] {
  const o = (x ?? {}) as Record<string, unknown>
  const out: DecisionInput['scores'] = {}
  for (const d of DECISION_DIMENSIONS) {
    const e = o[d] as Record<string, unknown> | undefined
    if (e && typeof e.score === 'number') {
      out[d as DecisionDimension] = { score: e.score, note: typeof e.note === 'string' ? e.note.slice(0, 200) : undefined }
    }
  }
  return out
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

  // V2 — cache por (día + hash del texto): evaluar la MISMA decisión el mismo día
  // devuelve lo cacheado (fail-open). Chequeo antes del rate-limit para no gastar
  // cuota en un hit. Decisiones distintas → cache_key distinta, no colisionan.
  const cacheKey = decisionCacheKey(todayLimaKey(), title, description)
  if (!force) {
    const cached = await readDailyCache<{ assessment: ReturnType<typeof evaluateDecision> }>(
      supabase, auth.user.id, 'decision', cacheKey,
    )
    if (cached) return NextResponse.json({ ...cached, cached: true })
  }

  const rl = await enforceRateLimit(supabase, auth.user.id, 'generation')
  if (!rl.ok) return rl.response

  const userId = auth.user.id
  const user = `Decisión: ${title || '(sin título)'}\n${description ? `Contexto: ${description}` : ''}\n\nPuntuá las 7 dimensiones.`

  // LLM vía capa llm/ (router + fallback + telemetría). tier capable: puntaje de
  // decisión de Aaron (juicio) — no bajar modelo (AI_USAGE_AUDIT bucket a).
  async function call(extra = ''): Promise<string> {
    const res = await complete(
      { task: 'decision', tier: 'capable', sensitivity: 'self', maxTokens: 700,
        system: extra ? `${SYSTEM}\n\n${extra}` : SYSTEM,
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
  if (!parsed || typeof parsed !== 'object') {
    try { parsed = JSON.parse(stripFences(await call('CRÍTICO: devolvé SOLO el JSON, empezando con { y terminando con }.'))) } catch {
      return errorJson(502, 'Claude devolvió formato inválido')
    }
  }

  const scores = toScores(parsed)
  if (Object.keys(scores).length === 0) return errorJson(502, 'No pude puntuar la decisión')

  const assessment = evaluateDecision({ title: title || description.slice(0, 80), scores })

  // Cachear (idempotente por user+día+hash). Fail-open.
  await writeDailyCache(supabase, auth.user.id, 'decision', cacheKey, { assessment })
  return NextResponse.json({ assessment, cached: false })
}
