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

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { getObservationsForPerson } from '@/lib/observations/fetch'
import { CONVERSATION_CAPTURE_TYPES } from '@/lib/capture/observations/types'
import { rowToPersonSynthesis } from '@/lib/person-synthesis/fetch'
import {
  SYNTHESIS_SYSTEM_PROMPT,
  buildSynthesisInput,
  type SynthesisConversation,
} from '@/lib/person-synthesis/prompt'
import type { PersonSynthesis, PersonSynthesisError } from '@/lib/person-synthesis/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_CONVERSATIONS = 40

interface PostBody {
  person_id?: unknown
}

function errorJson(status: number, error: string, detail?: string): NextResponse<PersonSynthesisError> {
  return NextResponse.json({ error, detail }, { status })
}

/** Lee summary/topics/emotionalStates de una observation whatsapp_chat
 *  de forma defensiva (data es Record<string, unknown>). */
function toConversation(observedAt: string, data: Record<string, unknown>): SynthesisConversation {
  const summary = typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : null
  const topics = Array.isArray(data.topics)
    ? data.topics.filter((t): t is string => typeof t === 'string')
    : []
  const emo = (data.emotionalStates ?? {}) as Record<string, unknown>
  const emotionalUser = typeof emo.user === 'string' && emo.user.trim() ? emo.user.trim() : null
  const emotionalOther =
    typeof emo.otherPerson === 'string' && emo.otherPerson.trim() ? emo.otherPerson.trim() : null
  return { observedAt, summary, topics, emotionalUser, emotionalOther }
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
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

  // 4. Conversaciones curadas (whatsapp_chat + whatsapp_web, is_obsolete=false)
  const observations = await getObservationsForPerson(supabase, userId, personId, {
    captureType: CONVERSATION_CAPTURE_TYPES,
    limit: MAX_CONVERSATIONS,
  })
  if (observations.length === 0) {
    return errorJson(
      422,
      'Sin conversaciones para sintetizar',
      'Registrá al menos una captura de WhatsApp con esta persona.',
    )
  }
  const convs = observations.map((o) => toConversation(o.observedAt, o.data))
  const sourceIds = observations.map((o) => o.id)

  // 5. LLM
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })

  let text = ''
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  try {
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 800,
      system: SYNTHESIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildSynthesisInput(personName, convs) }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
    inputTokens = msg.usage?.input_tokens ?? null
    outputTokens = msg.usage?.output_tokens ?? null
  } catch (e) {
    reportApiError(e)
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
      source_observation_count: observations.length,
      source_observation_ids: sourceIds,
      model_used: MODEL_ID,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      is_current: true,
      generated_reason: 'manual',
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
