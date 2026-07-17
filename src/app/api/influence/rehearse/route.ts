// SIR V2 — POST /api/influence/rehearse  (16·M4: Sala de ensayo — caminos al objetivo)
//
// Recibe { personId, objective }. Carga a la persona (incl. ámbito, que decide el
// registro afectivo vs profesional) + sus memorias VISIBLES (getMemoriesForPerson
// ya excluye lo privado), arma el contexto y pide a Sonnet los caminos/objeciones/
// acciones como HIPÓTESIS (ensayo, no predicción), con influencia habilitada y
// riesgos de otros dominios separados. NO escribe.

import { complete, LlmError } from '@/lib/llm'
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
import { getYearNorte } from '@/lib/year-compass/norte'
import { renderLearningsBlock, rowToLearning, type LearningRow } from '@/lib/learnings/recall'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// El ensayo puede hacer hasta 2 llamadas a Claude (retry por JSON). Con contexto
// rico (conversación importada + estado bio + repertorio de movidas) el prompt
// crece y una persona como Diana llegaba a cortar a los 60s. La plataforma soporta
// hasta 300s; 120s cubre el peor caso de doble llamada con holgura.
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

  let body: { personId?: unknown; objective?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  const objective = typeof body.objective === 'string' ? body.objective.trim().slice(0, 600) : ''
  if (!personId) return errorJson(400, 'Falta la persona')
  if (!objective) return errorJson(400, 'Cuéntame qué quieres lograr')

  const { data: person } = await supabase
    .from('people')
    .select('id, name, title, organization, relationship, ambito, cycle_start_date, cycle_length_days, last_contact')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (!person) return errorJson(404, 'No encontré esa persona')

  const personName = (person.name as string) ?? 'esa persona'

  // 16.M5 - Termometro de Jugada ANTES del LLM. Influencia no bloquea; solo
  // riesgos de otros dominios se pasan como blocked/high_risk.
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
    return NextResponse.json({ result: blocked, person: { name: personName, hadContext: false }, ethics })
  }

  // Toda la carga de contexto EN PARALELO (antes era secuencial y sumaba latencia
  // → cruzaba el cap de 60s de Vercel Hobby). memorias + conversación (WhatsApp) +
  // estado bio de Aaron (doc 13) + contexto rico (ciclo M6 + Pulso C0).
  const rep = (e: unknown) => { reportApiError(e, { route: 'influence/rehearse' }) }
  const [memories, conversation, selfState, extras, norte] = await Promise.all([
    getMemoriesForPerson(supabase, userId, personId, { limit: 24 })
      .then((rows) => rows.map((m) => (m.content ?? '').trim()).filter(Boolean))
      .catch((e) => { rep(e); return [] as string[] }),
    getPersonConversation(supabase, userId, personId)
      .then((conv) => (conv ? renderConversationForPrompt(conv, personName) : undefined))
      .catch((e) => { rep(e); return undefined }),
    getSelfBioState(supabase, userId, Date.now())
      .then((bio) => bio.block || undefined)
      .catch((e) => { rep(e); return undefined }),
    gatherRehearseExtras(supabase, userId, {
      id: personId,
      relationship: (person.relationship as string) ?? null,
      cycleStartDate: (person.cycle_start_date as string) ?? null,
      cycleLengthDays: (person.cycle_length_days as number) ?? null,
      lastContactMs: person.last_contact ? Date.parse(person.last_contact as string) : null,
    }, Date.now()).catch((e) => { rep(e); return {} as import('@/lib/influence/rehearseContext').RehearseExtras }),
    // El norte del año: MISMA fuente que "TU NORTE" del panel (deriva el ancla, no
    // lee is_anchor — que hoy nadie prende). Así el ensayo tira del norte que Aaron
    // realmente ve. Fail-open a undefined (getYearNorte ya traga sus errores).
    getYearNorte(supabase, userId).then((n) => n ?? undefined),
  ])
  const cycleNote = extras.cycleNote
  const pulse = extras.pulse
  const openThreads = extras.openThreads
  const bondState = extras.bondState

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
    openThreads,
    bondState,
    norte,
  }
  // Fase 3d — sumar las lecciones durables que SIR aprendió de Aaron, para que el
  // ensayo tire de sus principios/preferencias. Fail-open sin la tabla 0140.
  let learningsBlock = ''
  try {
    const { data: lrows } = await supabase
      .from('learnings').select('text, kind, confidence, reinforced_count')
      .eq('user_id', userId).eq('is_active', true)
      .order('reinforced_count', { ascending: false }).limit(30)
    if (lrows && lrows.length > 0) learningsBlock = renderLearningsBlock((lrows as LearningRow[]).map(rowToLearning))
  } catch { /* sin tabla → sin bloque */ }

  const user = buildRehearseUserContent(ctx, objective) + (learningsBlock ? `\n\n${learningsBlock}` : '')

  // LLM vía capa llm/ (router + fallback + telemetría). tier capable:
  // ensayo de abordaje (carga contexto de un tercero → sensitivity third_party).
  async function call(extra = ''): Promise<string> {
    const res = await complete(
      {
        task: 'influence_rehearse', tier: 'capable', sensitivity: 'third_party', maxTokens: 1600,
        system: extra ? `${REHEARSE_SYSTEM_PROMPT}\n\n${extra}` : REHEARSE_SYSTEM_PROMPT,
        // Prefill '{' fuerza a Claude a arrancar el JSON directo → UNA sola llamada
        // confiable, sin el doble-call de reintento que empujaba el request > 60s
        // (Vercel Hobby corta a 60s e IGNORA el maxDuration=120 de arriba).
        messages: [
          { role: 'user', content: user },
          { role: 'assistant', content: '{' },
        ],
      },
      { supabase, userId },
    )
    const text = res.text
    return text ? `{${text}` : ''
  }

  // 16.M5: si aparece riesgo de otro dominio, el modelo no bloquea por influencia;
  // reformula hacia una version estrategica y sostenible.
  const ethicsExtra = ethics.verdict === 'caution' || ethics.verdict === 'high_risk'
    ? `TERMOMETRO DE JUGADA (16.M5): ${ethics.message}
Score: ${ethics.score}/100. Lineas: ${ethics.lines.join(', ') || 'ninguna'}.
Sustento: ${ethics.whyItMatters}
Reformulacion recomendada: ${ethics.safeAggressiveReframe}
	Ayuda a Aaron con la version mas conveniente. Influencia no bloquea; si hay riesgo de otro dominio, reformula el metodo.`
    : ''

  const t0 = Date.now()
  let raw = ''
  try {
    raw = await call(ethicsExtra)
  } catch (e) {
    const detail = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    reportApiError(e, { route: 'influence/rehearse' })
    await logEvent(supabase, userId, { type: 'rehearse', ok: false, route: 'influence/rehearse', durationMs: Date.now() - t0, meta: { stage: 'llm', personId, detail } })
    if (e instanceof LlmError && e.code === 'no_provider') return errorJson(500, 'No hay proveedor LLM configurado en el server')
    return errorJson(502, 'Falló la llamada al modelo', detail)
  }

  const result = parseRehearseJson(raw)
  if (!result) {
    await logEvent(supabase, userId, { type: 'rehearse', ok: false, route: 'influence/rehearse', durationMs: Date.now() - t0, meta: { stage: 'parse', personId } })
    return errorJson(502, 'Claude devolvió un formato inesperado', 'Reintenta en un momento.')
  }

  await logEvent(supabase, userId, { type: 'rehearse', ok: true, route: 'influence/rehearse', durationMs: Date.now() - t0, meta: { personId, scenarios: result.scenarios.length } })

  // Histórico de simulaciones (best-effort, no bloquea la respuesta).
  try {
    await supabase.from('rehearsal_sessions').insert({
      user_id: userId, person_id: personId, person_name: personName, objective, result,
      context_used: {
        cycle: !!cycleNote, pulse: !!pulse, selfState: !!selfState,
        openThreads: !!openThreads, bondState: !!bondState, memories: memories.length, conversation: !!conversation, norte: !!norte,
      },
    })
  } catch (e) { reportApiError(e, { route: 'influence/rehearse', stage: 'persist' }) }

  return NextResponse.json({ result, person: { name: ctx.personName, hadContext: memories.length > 0 }, ethics })
}
