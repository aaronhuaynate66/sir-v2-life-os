// SIR V2 — POST /api/influence/tactics  (playbook de influencia #3: escenario→táctica)
//
// Recibe { personId, scenario, note? }. Carga la persona + sus memorias VISIBLES +
// la conversación real (WhatsApp), y le pide al modelo que LEA el estilo real de la
// persona y recomiende 2-3 técnicas con nombre (Voss/Cialdini/Harvard) del
// repertorio curado, atadas a ese estilo, con la frase real que las sostiene. NO
// escribe. Influencia habilitada; solo riesgos de otro dominio (16.M5) frenan.

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { logEvent } from '@/lib/observability/logEvent'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { getPersonConversation, renderConversationForPrompt } from '@/lib/people/conversation'
import { checkEthics } from '@/engines/ethics'
import {
  TACTICS_SYSTEM_PROMPT, buildTacticsUserContent, parseTacticsJson, scenarioById,
  type TacticsContext,
} from '@/lib/influence/tactics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  const userId = auth.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  let body: { personId?: unknown; scenario?: unknown; note?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  const scenarioId = typeof body.scenario === 'string' ? body.scenario : ''
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 400) : ''
  if (!personId) return errorJson(400, 'Falta la persona')
  const scenario = scenarioById(scenarioId)
  if (!scenario) return errorJson(400, 'Elige un tipo de conversación')

  const { data: person } = await supabase
    .from('people')
    .select('id, name, relationship, ambito')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (!person) return errorJson(404, 'No encontré esa persona')
  const personName = (person.name as string) ?? 'esa persona'

  // 16.M5 — Termómetro de jugada sobre el escenario + la nota. Influencia no
  // bloquea; solo cruces reales (fraude/coerción/exposición) frenan.
  const ethics = checkEthics(`${scenario.label}. ${note}`, {
    ambito: (person.ambito as string) ?? undefined,
    relationship: (person.relationship as string) ?? undefined,
  })
  if (ethics.verdict === 'blocked') {
    return NextResponse.json({
      blocked: true, person: { name: personName },
      ethics, message: ethics.message,
    })
  }

  const rep = (e: unknown) => { reportApiError(e, { route: 'influence/tactics' }) }
  const [memories, conversation] = await Promise.all([
    getMemoriesForPerson(supabase, userId, personId, { limit: 24 })
      .then((rows) => rows.map((m) => (m.content ?? '').trim()).filter(Boolean))
      .catch((e) => { rep(e); return [] as string[] }),
    getPersonConversation(supabase, userId, personId)
      .then((conv) => (conv ? renderConversationForPrompt(conv, personName) : undefined))
      .catch((e) => { rep(e); return undefined }),
  ])

  const ctx: TacticsContext = {
    personName,
    ambito: (person.ambito as string) ?? undefined,
    relationship: (person.relationship as string) ?? undefined,
    scenario,
    note,
    memories,
    conversation,
  }
  const userContent = buildTacticsUserContent(ctx)

  // Si el escenario roza otro dominio, reformular hacia lo honesto (no bloquear).
  const ethicsExtra = ethics.verdict === 'caution' || ethics.verdict === 'high_risk'
    ? `TERMÓMETRO DE JUGADA (16.M5): ${ethics.message} Reformula hacia la versión honesta y sostenible: ${ethics.safeAggressiveReframe}`
    : ''

  async function call(): Promise<string> {
    const res = await complete(
      {
        task: 'influence_tactics', tier: 'capable', sensitivity: 'third_party', maxTokens: 1300,
        system: ethicsExtra ? `${TACTICS_SYSTEM_PROMPT}\n\n${ethicsExtra}` : TACTICS_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userContent },
          { role: 'assistant', content: '{' },
        ],
      },
      { supabase, userId },
    )
    return res.text ? `{${res.text}` : ''
  }

  const t0 = Date.now()
  let raw = ''
  try {
    raw = await call()
  } catch (e) {
    const detail = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    reportApiError(e, { route: 'influence/tactics' })
    await logEvent(supabase, userId, { type: 'tactics', ok: false, route: 'influence/tactics', durationMs: Date.now() - t0, meta: { stage: 'llm', personId, detail } })
    if (e instanceof LlmError && e.code === 'no_provider') return errorJson(500, 'No hay proveedor LLM configurado en el server')
    return errorJson(502, 'Falló la llamada al modelo', detail)
  }

  const recommendation = parseTacticsJson(raw)
  if (!recommendation) {
    await logEvent(supabase, userId, { type: 'tactics', ok: false, route: 'influence/tactics', durationMs: Date.now() - t0, meta: { stage: 'parse', personId } })
    return errorJson(502, 'El modelo devolvió un formato inesperado', 'Reintenta en un momento.')
  }

  await logEvent(supabase, userId, { type: 'tactics', ok: true, route: 'influence/tactics', durationMs: Date.now() - t0, meta: { personId, scenario: scenario.id, picks: recommendation.picks.length } })

  return NextResponse.json({
    recommendation,
    person: { name: personName, hadContext: memories.length > 0 || !!conversation },
    ethics,
  })
}
