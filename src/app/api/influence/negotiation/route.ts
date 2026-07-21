// SIR V2 — POST /api/influence/negotiation  (playbook de influencia #05: BATNA/ZOPA)
//
// Recibe { personId, subject, goal?, alternative? }. Carga persona + memorias
// VISIBLES + conversación real, y pide el marco racional de Harvard: BATNA, ZOPA,
// ancla, movidas y punto de retirada, aterrizado en lo que el otro dijo. NO escribe.
// Presión/apalancamiento habilitados; solo riesgos de otro dominio (16.M5) frenan.

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { logEvent } from '@/lib/observability/logEvent'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { getPersonConversation, renderConversationForPrompt } from '@/lib/people/conversation'
import { getSelfBioState, selfStateGate } from '@/lib/people/selfState'
import { checkEthics } from '@/engines/ethics'
import {
  NEGOTIATION_SYSTEM_PROMPT, buildNegotiationUserContent, parseNegotiationJson,
  type NegotiationContext,
} from '@/lib/influence/negotiationPrep'

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

  let body: { personId?: unknown; subject?: unknown; goal?: unknown; alternative?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 300) : ''
  const goal = typeof body.goal === 'string' ? body.goal.trim().slice(0, 300) : ''
  const alternative = typeof body.alternative === 'string' ? body.alternative.trim().slice(0, 300) : ''
  if (!personId) return errorJson(400, 'Falta la persona')
  if (!subject) return errorJson(400, 'Cuéntame qué vas a negociar')

  const { data: person } = await supabase
    .from('people')
    .select('id, name, title, organization, relationship, ambito')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (!person) return errorJson(404, 'No encontré esa persona')
  const personName = (person.name as string) ?? 'esa persona'

  // 16.M5 — Termómetro de jugada sobre lo que se negocia + el objetivo. Presión no
  // bloquea; solo cruces reales (coerción/engaño/exposición) frenan.
  const ethics = checkEthics(`${subject}. ${goal}`, {
    ambito: (person.ambito as string) ?? undefined,
    relationship: (person.relationship as string) ?? undefined,
  })
  if (ethics.verdict === 'blocked') {
    return NextResponse.json({ blocked: true, person: { name: personName }, ethics, message: ethics.message })
  }

  const rep = (e: unknown) => { reportApiError(e, { route: 'influence/negotiation' }) }
  const [memories, conversation] = await Promise.all([
    getMemoriesForPerson(supabase, userId, personId, { limit: 24 })
      .then((rows) => rows.map((m) => (m.content ?? '').trim()).filter(Boolean))
      .catch((e) => { rep(e); return [] as string[] }),
    getPersonConversation(supabase, userId, personId)
      .then((conv) => (conv ? renderConversationForPrompt(conv, personName) : undefined))
      .catch((e) => { rep(e); return undefined }),
  ])

  const ctx: NegotiationContext = {
    personName,
    role: (person.title as string) ?? undefined,
    organization: (person.organization as string) ?? undefined,
    relationship: (person.relationship as string) ?? undefined,
    ambito: (person.ambito as string) ?? undefined,
    subject, goal, alternative, memories, conversation,
  }
  const userContent = buildNegotiationUserContent(ctx)

  // Gate "¿estás para esto?" (F1): el ESTADO propio de Aaron (ventana de
  // tolerancia) calibra el consejo — si está fuera de su ventana, la ciencia dice
  // regular antes de negociar en caliente. Es su data, para su beneficio (ético).
  const selfState = await getSelfBioState(supabase, userId, Date.now())
  const selfWarning = selfStateGate(selfState)

  const ethicsExtra = ethics.verdict === 'caution' || ethics.verdict === 'high_risk'
    ? `TERMÓMETRO DE JUGADA (16.M5): ${ethics.message} Reformula hacia la versión honesta y sostenible: ${ethics.safeAggressiveReframe}`
    : ''
  const systemExtras = [ethicsExtra, selfState.block].filter(Boolean).join('\n\n')

  async function call(): Promise<string> {
    const res = await complete(
      {
        task: 'influence_negotiation', tier: 'capable', sensitivity: 'third_party', maxTokens: 1500,
        system: systemExtras ? `${NEGOTIATION_SYSTEM_PROMPT}\n\n${systemExtras}` : NEGOTIATION_SYSTEM_PROMPT,
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
    reportApiError(e, { route: 'influence/negotiation' })
    await logEvent(supabase, userId, { type: 'negotiation', ok: false, route: 'influence/negotiation', durationMs: Date.now() - t0, meta: { stage: 'llm', personId, detail } })
    if (e instanceof LlmError && e.code === 'no_provider') return errorJson(500, 'No hay proveedor LLM configurado en el server')
    return errorJson(502, 'Falló la llamada al modelo', detail)
  }

  const prep = parseNegotiationJson(raw)
  if (!prep) {
    await logEvent(supabase, userId, { type: 'negotiation', ok: false, route: 'influence/negotiation', durationMs: Date.now() - t0, meta: { stage: 'parse', personId } })
    return errorJson(502, 'El modelo devolvió un formato inesperado', 'Reintenta en un momento.')
  }

  await logEvent(supabase, userId, { type: 'negotiation', ok: true, route: 'influence/negotiation', durationMs: Date.now() - t0, meta: { personId } })

  return NextResponse.json({
    prep,
    person: { name: personName, hadContext: memories.length > 0 || !!conversation },
    ethics,
    selfWarning,
  })
}
