// SIR V2 — POST /api/person-synthesis (#8 "Lo personal" del detail page)
//
// Genera (y cachea) la síntesis narrativa de una persona con el LLM, a
// partir de sus conversaciones WhatsApp curadas (is_obsolete=false).
//
// Body JSON: { person_id: string }
// Response 201: { synthesis: PersonSynthesis }
//
// Flujo:
//   1. Auth + person ownership (404 si ajena) — mismo patrón que
//      /api/person-logs.
//   2. Fetch whatsapp_chat observations curadas (limit 40, observed_at DESC).
//      422 si no hay ninguna (sin material para sintetizar).
//   3. Anthropic messages.create (Sonnet 4.5, mismo modelo que la captura
//      WhatsApp que ya corre en prod). 500 si falta ANTHROPIC_API_KEY.
//   4. Archivar la síntesis vigente (UPDATE is_current=false — NO delete) +
//      INSERT del row nuevo (is_current=true).
//   5. Devolver la síntesis nueva.
//
// Nota: el paso 4 es un flag-flip (UPDATE), no un DELETE destructivo, así
// que conserva el historial de síntesis previas.

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { getObservationsForPerson } from '@/lib/observations/fetch'
import { CONVERSATION_CAPTURE_TYPES } from '@/lib/capture/observations/types'
import { getGoalsForPerson, buildGoalContext } from '@/lib/goals/forPerson'
import { readConversationSignals, hasRichConversationData } from '@/lib/memories/conversationSignals'
import { rowToPersonSynthesis } from '@/lib/person-synthesis/fetch'
import {
  SYNTHESIS_SYSTEM_PROMPT,
  buildSynthesisInput,
  type SynthesisConversation,
} from '@/lib/person-synthesis/prompt'
import { fetchChatMessages } from '@/lib/chat-messages/read'
import {
  SUBSTRATE_SYNTHESIS_SYSTEM,
  buildTranscriptSample,
  buildSubstrateUserMessage,
} from '@/lib/person-synthesis/fromSubstrate'
import type { PersonSynthesis, PersonSynthesisError } from '@/lib/person-synthesis/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MAX_CONVERSATIONS = 40
/** Con al menos esta cantidad de mensajes en el sustrato, sintetizamos del hilo
 *  REAL (texto) en vez del resumen con pérdida. Debajo, cae a observaciones. */
const MIN_SUBSTRATE_MSGS = 30
/** Ventana reciente del sustrato que leemos para la muestra del transcript. */
const SUBSTRATE_SAMPLE = 3000

interface PostBody {
  person_id?: unknown
}

function errorJson(status: number, error: string, detail?: string): NextResponse<PersonSynthesisError> {
  return NextResponse.json({ error, detail }, { status })
}

/** Mapea una observation whatsapp_chat a una conversación PARTIDA POR RECENCIA
 *  (estado reciente vs histórico + hechos + rango de fechas). Para data sin
 *  material rico (capturas viejas / por screenshot) cae al summary/topics. */
function toConversation(observedAt: string, data: Record<string, unknown>, now: Date): SynthesisConversation {
  const summary = typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : null
  const topics = Array.isArray(data.topics)
    ? data.topics.filter((t): t is string => typeof t === 'string')
    : []
  const emo = (data.emotionalStates ?? {}) as Record<string, unknown>
  const emotionalUser = typeof emo.user === 'string' && emo.user.trim() ? emo.user.trim() : null
  const emotionalOther =
    typeof emo.otherPerson === 'string' && emo.otherPerson.trim() ? emo.otherPerson.trim() : null

  if (!hasRichConversationData(data)) {
    return { observedAt, summary, topics, emotionalUser, emotionalOther }
  }
  const s = readConversationSignals(data, observedAt, now)
  return {
    observedAt,
    summary,
    topics: s.topics.length > 0 ? s.topics : topics,
    emotionalUser: s.emotionalUser ?? emotionalUser,
    emotionalOther: s.emotionalOther ?? emotionalOther,
    recentBlocks: s.recentBlocks,
    historicalBlocks: s.historicalBlocks,
    facts: s.facts,
    firstISO: s.firstISO,
    lastISO: s.lastISO,
    messageCount: s.messageCount,
  }
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Inicia sesión y reintenta.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response
  const userId = authData.user.id

  // 2. Body
  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }
  if (typeof body.person_id !== 'string' || body.person_id.length === 0) {
    return errorJson(400, 'person_id requerido (string no vacio)')
  }
  const personId = body.person_id

  // 3. Person ownership (+ nombre para el prompt)
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id, name')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) {
    return errorJson(500, 'No se pudo verificar la persona', personErr.message)
  }
  if (!personRow) {
    return errorJson(404, 'Persona no encontrada o sin permiso')
  }
  const personName = (personRow.name as string) ?? 'esta persona'

  // Contexto de objetivos vinculados (conciencia del deal). Tolerante: sin
  // objetivos → null y la síntesis corre como antes. Se usa en ambas fuentes.
  const goals = await getGoalsForPerson(supabase, userId, personId)
  const goalContext = buildGoalContext(goals)

  // 4. FUENTE — sustrato-first. Si hay hilo REAL suficiente en chat_messages
  //    (mig 0141), sintetizamos del transcript textual reciente; si no, caemos
  //    al resumen curado de las observaciones (camino histórico, sin regresión).
  const subRows = await fetchChatMessages(supabase, userId, personId, SUBSTRATE_SAMPLE)
  let system: string
  let userContent: string
  let sourceCount: number
  let sourceIds: string[]
  let generatedReason: string

  if (subRows.length >= MIN_SUBSTRATE_MSGS) {
    const first = subRows[0]?.sent_at ? String(subRows[0].sent_at).slice(0, 10) : null
    const last = subRows[subRows.length - 1]?.sent_at ? String(subRows[subRows.length - 1].sent_at).slice(0, 10) : null
    system = SUBSTRATE_SYNTHESIS_SYSTEM
    userContent = buildSubstrateUserMessage(
      personName,
      buildTranscriptSample(subRows, personName),
      subRows.length,
      first,
      last,
      goalContext,
    )
    sourceCount = subRows.length
    sourceIds = []
    generatedReason = 'chat_messages'
  } else {
    const observations = await getObservationsForPerson(supabase, userId, personId, {
      captureType: CONVERSATION_CAPTURE_TYPES,
      limit: MAX_CONVERSATIONS,
    })
    if (observations.length === 0) {
      return errorJson(
        422,
        'Sin conversaciones para sintetizar',
        'Registra al menos una captura de WhatsApp con esta persona.',
      )
    }
    const now = new Date()
    const convs = observations.map((o) => toConversation(o.observedAt, o.data, now))
    system = SYNTHESIS_SYSTEM_PROMPT
    userContent = buildSynthesisInput(personName, convs, goalContext)
    sourceCount = observations.length
    sourceIds = observations.map((o) => o.id)
    generatedReason = 'manual'
  }

  // 5. LLM — vía capa llm/ (router + fallback + telemetría en ai_usage).
  //    tier balanced: narrativa corta sobre un vínculo (ver AI_USAGE_AUDIT bucket a).
  let text = ''
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let modelUsed = ''
  try {
    const res = await complete(
      {
        task: 'person_synthesis', tier: 'balanced', sensitivity: 'third_party',
        system,
        messages: [{ role: 'user', content: userContent }],
        maxTokens: 1000,
      },
      { supabase, userId },
    )
    text = res.text.trim()
    inputTokens = res.usage.inputTokens
    outputTokens = res.usage.outputTokens
    modelUsed = res.model
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') {
      return errorJson(500, 'No hay proveedor LLM configurado en el server')
    }
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo de síntesis', m.slice(0, 300))
  }
  if (!text) {
    return errorJson(502, 'El modelo devolvió una síntesis vacía')
  }

  // 6. Archivar vigente (flag-flip, no delete) + insertar la nueva.
  const { error: archiveErr } = await supabase
    .from('person_synthesis')
    .update({ is_current: false })
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('is_current', true)
  if (archiveErr) {
    return errorJson(500, 'No se pudo archivar la síntesis previa', archiveErr.message)
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('person_synthesis')
    .insert({
      user_id: userId,
      person_id: personId,
      synthesis_text: text,
      source_observation_count: sourceCount,
      source_observation_ids: sourceIds,
      model_used: modelUsed,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      is_current: true,
      generated_reason: generatedReason,
    })
    .select(
      'id, person_id, synthesis_text, source_observation_count, source_observation_ids, model_used, input_tokens, output_tokens, generated_at, is_current, generated_reason',
    )
    .single()

  if (insertErr || !inserted) {
    return errorJson(500, 'No se pudo guardar la síntesis', insertErr?.message ?? 'sin data')
  }

  const synthesis: PersonSynthesis = rowToPersonSynthesis(inserted as Record<string, unknown>)
  return NextResponse.json({ synthesis }, { status: 201 })
}
