// SIR V2 — POST /api/influence/rehearse  (16·M4: Sala de ensayo — caminos al objetivo)
//
// Recibe { personId, objective }. Carga a la persona (incl. ámbito, que decide el
// registro afectivo vs profesional) + sus memorias VISIBLES (getMemoriesForPerson
// ya excluye lo privado), arma el contexto y pide a Sonnet los caminos/objeciones/
// acciones como HIPÓTESIS (ensayo, no predicción), con guardrail ético. NO escribe.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { logEvent } from '@/lib/observability/logEvent'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { getPersonConversation, renderConversationForPrompt } from '@/lib/people/conversation'
import { gatherRehearseExtras } from '@/lib/influence/rehearseContext'
import { getSelfBioState } from '@/lib/people/selfState'
import { REHEARSE_SYSTEM_PROMPT, buildRehearseUserContent, parseRehearseJson, type RehearseContext, type RehearseResult } from '@/lib/influence/rehearsePrompt'
import { checkEthics } from '@/engines/ethics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// El ensayo puede hacer hasta 2 llamadas a Claude (retry por JSON). Con contexto
// rico (conversación importada + estado bio + repertorio de movidas) el prompt
// crece y una persona como Diana llegaba a cortar a los 60s. La plataforma soporta
// hasta 300s; 120s cubre el peor caso de doble llamada con holgura.
export const maxDuration = 120

const MODEL_ID = 'claude-sonnet-4-5'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  const userId = auth.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  let body: { personId?: unknown; objective?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  const objective = typeof body.objective === 'string' ? body.objective.trim().slice(0, 600) : ''
  if (!personId) return errorJson(400, 'Falta la persona')
  if (!objective) return errorJson(400, 'Contame qué querés lograr')

  const { data: person } = await supabase
    .from('people')
    .select('id, name, title, organization, relationship, ambito, cycle_start_date, cycle_length_days')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (!person) return errorJson(404, 'No encontré esa persona')

  const personName = (person.name as string) ?? 'esa persona'

  // 16·M5 — chequeo ético ANTES del LLM (guardrail determinístico, no opcional).
  // Si el objetivo cruza la línea (engaño/presión/explotación), SIR rechaza acá
  // mismo, sin gastar la llamada al modelo ni arriesgar que se auto-vigile.
  const ethics = checkEthics(objective, {
    ambito: (person.ambito as string) ?? undefined,
    relationship: (person.relationship as string) ?? undefined,
  })
  if (ethics.verdict === 'blocked') {
    const blocked: RehearseResult = {
      read: 'Antes de ensayar nada, esto no pasa la prueba de fuego.',
      scenarios: [],
      objections: [],
      actions: [],
      opener: '',
      watchout: ethics.litmus,
      ethicalNote: ethics.message,
    }
    return NextResponse.json({ result: blocked, person: { name: personName, hadContext: false }, ethics: { verdict: ethics.verdict } })
  }

  let memories: string[] = []
  try {
    const rows = await getMemoriesForPerson(supabase, userId, personId, { limit: 24 })
    memories = rows.map((m) => (m.content ?? '').trim()).filter(Boolean)
  } catch (e) { reportApiError(e, { route: 'influence/rehearse' }) }

  // Jalar la conversación importada (WhatsApp) para simular sobre lo real, no en abstracto.
  let conversation: string | undefined
  try {
    const conv = await getPersonConversation(supabase, userId, personId)
    if (conv) conversation = renderConversationForPrompt(conv, personName)
  } catch (e) { reportApiError(e, { route: 'influence/rehearse' }) }

  // Estado bio de Aaron (ventana de tolerancia): calibra si el consejo es "hablá"
  // o "regulá primero" — doc 13. Afectivo sobre todo (una pelea de pareja en
  // caliente sale mal), pero sirve en cualquier vínculo.
  let selfState: string | undefined
  try {
    const bio = await getSelfBioState(supabase, userId, Date.now())
    if (bio.block) selfState = bio.block
  } catch (e) { reportApiError(e, { route: 'influence/rehearse' }) }

  // Contexto rico (motor de predicción + M6): ciclo/atunamiento (romántico, marco
  // de cuidado) + Pulso de la conversación (C0). selfState ya lo tenemos arriba.
  let cycleNote: string | undefined
  let pulse: string | undefined
  try {
    const extras = await gatherRehearseExtras(supabase, userId, {
      id: personId,
      relationship: (person.relationship as string) ?? null,
      cycleStartDate: (person.cycle_start_date as string) ?? null,
      cycleLengthDays: (person.cycle_length_days as number) ?? null,
    }, Date.now())
    cycleNote = extras.cycleNote
    pulse = extras.pulse
  } catch (e) { reportApiError(e, { route: 'influence/rehearse' }) }

  const ctx: RehearseContext = {
    personName,
    role: (person.title as string) ?? undefined,
    organization: (person.organization as string) ?? undefined,
    relationship: (person.relationship as string) ?? undefined,
    ambito: (person.ambito as string) ?? undefined,
    memories,
    conversation,
    selfState,
    cycleNote,
    pulse,
  }
  const user = buildRehearseUserContent(ctx, objective)

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })

  async function call(extra = ''): Promise<string> {
    const msg = await client.messages.create({
      model: MODEL_ID, max_tokens: 1400,
      system: extra ? `${REHEARSE_SYSTEM_PROMPT}\n\n${extra}` : REHEARSE_SYSTEM_PROMPT,
      // Prefill '{' fuerza a Claude a arrancar el JSON directo → UNA sola llamada
      // confiable, sin el doble-call de reintento que empujaba el request > 60s
      // (Vercel Hobby corta a 60s e IGNORA el maxDuration=120 de arriba).
      messages: [
        { role: 'user', content: user },
        { role: 'assistant', content: '{' },
      ],
    })
    const block = msg.content.find((b) => b.type === 'text')
    const text = block && block.type === 'text' ? block.text : ''
    return text ? `{${text}` : ''
  }

  // 16·M5 (caution): objetivo en zona gris afectiva → recordarle al modelo que
  // el registro es cuidado, no estrategia.
  const ethicsExtra = ethics.verdict === 'caution'
    ? `CHEQUEO ÉTICO (16·M5): ${ethics.message}\nMantené el registro de cuidado; no ensayes "cómo conseguir que…".`
    : ''

  const t0 = Date.now()
  let raw = ''
  try {
    raw = await call(ethicsExtra)
  } catch (e) {
    const detail = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    reportApiError(e, { route: 'influence/rehearse' })
    await logEvent(supabase, userId, { type: 'rehearse', ok: false, route: 'influence/rehearse', durationMs: Date.now() - t0, meta: { stage: 'llm', personId, detail } })
    return errorJson(502, 'Falló la llamada a Claude', detail)
  }

  const result = parseRehearseJson(raw)
  if (!result) {
    await logEvent(supabase, userId, { type: 'rehearse', ok: false, route: 'influence/rehearse', durationMs: Date.now() - t0, meta: { stage: 'parse', personId } })
    return errorJson(502, 'Claude devolvió un formato inesperado', 'Reintentá en un momento.')
  }

  await logEvent(supabase, userId, { type: 'rehearse', ok: true, route: 'influence/rehearse', durationMs: Date.now() - t0, meta: { personId, scenarios: result.scenarios.length } })

  // Histórico de simulaciones (best-effort, no bloquea la respuesta).
  try {
    await supabase.from('rehearsal_sessions').insert({
      user_id: userId, person_id: personId, person_name: personName, objective, result,
      context_used: {
        cycle: !!cycleNote, pulse: !!pulse, selfState: !!selfState,
        memories: memories.length, conversation: !!conversation,
      },
    })
  } catch (e) { reportApiError(e, { route: 'influence/rehearse', stage: 'persist' }) }

  return NextResponse.json({ result, person: { name: ctx.personName, hadContext: memories.length > 0 } })
}
