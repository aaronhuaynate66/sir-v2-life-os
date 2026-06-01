// SIR V2 — POST /api/longitudinal/correlation-narrative (Fase 3c, opcional).
//
// Capa narrativa OPCIONAL de la vista de correlación. La vista en sí es
// determinística; este endpoint sólo se llama cuando el usuario pide la
// "lectura en prosa" (botón). Re-computa la correlación server-side (no
// confía en data del cliente), la resume en un digest determinístico y lo
// pasa a Anthropic.
//
// Body JSON: { person_id: string }
// Response 200: { narrative: string }
// 422 si no hay data suficiente para narrar (digest vacío).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { getLogsForPerson } from '@/lib/person-logs/fetch'
import {
  correlateByLunarPhase,
  correlateByCyclePhase,
} from '@/lib/longitudinal/correlation'
import {
  summarizeCorrelation,
  buildNarrativeUserMessage,
  CORRELATION_NARRATIVE_SYSTEM_PROMPT,
} from '@/lib/longitudinal/correlationNarrative'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_LOGS = 730 // ~2 años de registros.

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response
  const userId = authData.user.id

  let body: { person_id?: unknown }
  try {
    body = (await req.json()) as { person_id?: unknown }
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }
  if (typeof body.person_id !== 'string' || body.person_id.length === 0) {
    return errorJson(400, 'person_id requerido (string no vacio)')
  }
  const personId = body.person_id

  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id, cycle_start_date, cycle_length_days')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) {
    return errorJson(500, 'No se pudo verificar la persona', personErr.message)
  }
  if (!personRow) {
    return errorJson(404, 'Persona no encontrada o sin permiso')
  }

  const logs = await getLogsForPerson(supabase, userId, personId, { limit: MAX_LOGS })

  const lunar = correlateByLunarPhase(logs)
  const cycle = correlateByCyclePhase(
    logs,
    (personRow.cycle_start_date as string | null) ?? null,
    personRow.cycle_length_days != null ? Number(personRow.cycle_length_days) : 28,
  )
  const digest = summarizeCorrelation(lunar, cycle)
  if (!digest) {
    return errorJson(
      422,
      'Sin patrones suficientes para narrar',
      'Registrá más ánimo/energía/sueño/dolor para esta persona y reintentá.',
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })

  let text = ''
  try {
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 400,
      system: CORRELATION_NARRATIVE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildNarrativeUserMessage(digest) }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
  } catch (e) {
    reportApiError(e)
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo', m.slice(0, 300))
  }
  if (!text) {
    return errorJson(502, 'El modelo devolvió una lectura vacía')
  }

  return NextResponse.json({ narrative: text }, { status: 200 })
}
