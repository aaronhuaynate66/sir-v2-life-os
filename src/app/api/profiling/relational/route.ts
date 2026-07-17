// SIR V2 — POST /api/profiling/relational  (19·M1: perfil relacional por persona)
//
// Recibe { personId, force? }. Carga persona + memorias VISIBLES + notas de tono
// (person_logs interaction), arma el contexto y pide a Sonnet un perfil de CÓMO
// VINCULARSE (apego/personalidad/valores/comunicación) — hipótesis, NO
// diagnóstico (guardrail en el prompt). Cache diaria por persona (reusa
// ai_daily_cache/0120): re-generar el mismo día no re-llama salvo `force`.

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { getLogsForPerson } from '@/lib/person-logs/fetch'
import { readDailyCache, writeDailyCache } from '@/lib/ai-cache/dailyCache'
import { todayLimaKey } from '@/lib/dates/limaDay'
import {
  RELATIONAL_PROFILE_SYSTEM_PROMPT, buildProfileUserContent, parseRelationalProfileJson,
  type ProfileContext, type RelationalProfile,
} from '@/lib/profiling/relationalProfilePrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 40

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  const userId = auth.user.id

  let body: { personId?: unknown; force?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  if (!personId) return errorJson(400, 'Falta la persona')
  const force = body.force === true

  const cacheKey = `${todayLimaKey()}:${personId}`
  if (!force) {
    const cached = await readDailyCache<{ profile: RelationalProfile }>(supabase, userId, 'profile', cacheKey)
    if (cached?.profile) return NextResponse.json({ profile: cached.profile, cached: true })
  }

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  const { data: person } = await supabase
    .from('people')
    .select('id, name, title, relationship, ambito, energy_impact')
    .eq('user_id', userId).eq('id', personId).maybeSingle()
  if (!person) return errorJson(404, 'No encontré esa persona')

  let memories: string[] = []
  let interactionNotes: string[] = []
  try {
    const mems = await getMemoriesForPerson(supabase, userId, personId, { limit: 24 })
    memories = mems.map((m) => (m.content ?? '').trim()).filter(Boolean)
    const logs = await getLogsForPerson(supabase, userId, personId, { kind: 'interaction', limit: 20 })
    interactionNotes = logs
      .filter((l) => l.note && l.note.trim())
      .map((l) => `tono ${l.value}/5: ${l.note!.trim()}`)
  } catch (e) { reportApiError(e, { route: 'profiling/relational' }) }

  const ctx: ProfileContext = {
    personName: (person.name as string) ?? 'esa persona',
    role: (person.title as string) ?? undefined,
    relationship: (person.relationship as string) ?? undefined,
    ambito: (person.ambito as string) ?? undefined,
    energyImpact: (person.energy_impact as string) ?? undefined,
    memories,
    interactionNotes,
  }
  const user = buildProfileUserContent(ctx)

  // LLM vía capa llm/ (router + fallback + telemetría). tier capable:
  // perfil de un tercero (juicio) — sensitivity third_party.
  async function call(extra = ''): Promise<string> {
    const res = await complete(
      { task: 'profiling_relational', tier: 'capable', sensitivity: 'third_party', maxTokens: 1000,
        system: extra ? `${RELATIONAL_PROFILE_SYSTEM_PROMPT}\n\n${extra}` : RELATIONAL_PROFILE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: user }] },
      { supabase, userId },
    )
    return res.text
  }

  let raw = ''
  try { raw = await call() } catch (e) {
    reportApiError(e, { route: 'profiling/relational' })
    if (e instanceof LlmError && e.code === 'no_provider') return errorJson(500, 'No hay proveedor LLM configurado en el server')
    return errorJson(502, 'Falló la llamada al modelo', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let profile = parseRelationalProfileJson(raw)
  if (!profile) {
    try { profile = parseRelationalProfileJson(await call('CRÍTICO: devuelve SOLO el JSON, empezando con { y terminando con }.')) } catch { profile = null }
  }
  if (!profile) return errorJson(502, 'Claude devolvió formato inválido')

  await writeDailyCache(supabase, userId, 'profile', cacheKey, { profile })
  return NextResponse.json({ profile, cached: false })
}
