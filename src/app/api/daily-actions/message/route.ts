// SIR V2 — POST /api/daily-actions/message (GEMA A, capa IA).
//
// Genera EL mensaje copiable para UNA acción/persona (la gema de v1: listo para
// enviar sin editar). Aislado del scoring: una sola persona, un solo Haiku,
// max_tokens chico, maxDuration 30, maxRetries 2 → barato y sin timeout/502.
//
// Cache fail-open: si la tabla action_suggestions existe (mig 0048), cacheamos
// por (user, person, día) e idempotamos; si NO existe, generamos on-demand y
// seguimos (igual que rate_limits con su RPC). El contexto sensible (nombre,
// ubicación, notas) lo trae el SERVER desde la fila de la persona, no el cliente.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { personAdapter } from '@/lib/supabase/sync/adapters/relationships'
import {
  MESSAGE_SYSTEM_PROMPT,
  buildMessageContext,
  parseMessageJson,
  type MessageSuggestion,
} from '@/lib/daily-actions/messagePrompt'
import { relationshipTypeLabel, personCategoryLabel } from '@/lib/people/labels'
import type { Person } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-haiku-4-5-20251001'

const KIND_LABEL: Record<string, string> = {
  contact: 'retomar contacto',
  birthday: 'saludo de cumpleaños',
  special_date: 'fecha especial',
  cooling: 'destensar el vínculo',
  acknowledge: 'reconocer una novedad',
}

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

function todayBucket(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado')
  const userId = authData.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }

  const personId = typeof body.personId === 'string' ? body.personId : ''
  if (!personId) return errorJson(400, 'personId requerido')
  const kind = typeof body.kind === 'string' ? body.kind : 'contact'
  const reason = typeof body.reason === 'string' ? body.reason : 'Mantener el vínculo'
  const daysSinceContact =
    typeof body.daysSinceContact === 'number' ? body.daysSinceContact : null
  const daysUntil = typeof body.daysUntil === 'number' ? body.daysUntil : null
  const now = new Date()
  const dateBucket = todayBucket(now)

  // ── 1. Persona (contexto sensible desde el server, no del cliente) ──
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr || !personRow) return errorJson(404, 'Persona no encontrada')
  const person: Person = personAdapter.fromRow(personRow as Record<string, unknown>)

  // ── 2. Cache (fail-open): ¿ya generamos un mensaje hoy para esta persona? ──
  try {
    const { data: cached } = await supabase
      .from('action_suggestions')
      .select('action_text, timing_reason, message_suggestion, impact_prediction')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .eq('date_bucket', dateBucket)
      .maybeSingle()
    if (cached && typeof cached.message_suggestion === 'string' && cached.message_suggestion) {
      return NextResponse.json({ suggestion: cached as MessageSuggestion, cached: true }, { status: 200 })
    }
  } catch {
    /* tabla no aplicada todavía → seguimos sin cache */
  }

  // ── 3. Sin API key → 503 (el mensaje es opcional; la acción ya se ve) ──
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(
      503,
      'Generación de mensaje no disponible',
      'Falta ANTHROPIC_API_KEY. La acción y su razón se muestran igual sin el mensaje.',
    )
  }

  const context = buildMessageContext({
    personName: person.name,
    relationship: relationshipTypeLabel(person.relationship),
    categoryLabel: personCategoryLabel(person.category),
    reason,
    kindLabel: KIND_LABEL[kind] ?? 'contacto',
    daysSinceContact,
    daysUntil,
    location: person.location ?? null,
    notes: person.notes || null,
  })

  // ── 4. Generación (un solo Haiku) ──
  let suggestion: MessageSuggestion | null = null
  try {
    const client = new Anthropic({ maxRetries: 2 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 400,
      system: MESSAGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    suggestion = parseMessageJson(text)
  } catch (e) {
    reportApiError(e, { route: 'daily-actions/message', personId })
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo generar el mensaje', detail)
  }

  if (!suggestion) return errorJson(502, 'Respuesta vacía del modelo', 'Reintentá en unos segundos.')

  // ── 5. Cachear (fail-open / idempotente por día) ──
  try {
    await supabase.from('action_suggestions').upsert(
      {
        user_id: userId,
        person_id: personId,
        date_bucket: dateBucket,
        kind,
        action_text: suggestion.action_text,
        timing_reason: suggestion.timing_reason,
        message_suggestion: suggestion.message_suggestion,
        impact_prediction: suggestion.impact_prediction,
      },
      { onConflict: 'user_id,person_id,date_bucket' },
    )
  } catch {
    /* sin cache, ya devolvimos el mensaje igual */
  }

  return NextResponse.json({ suggestion, cached: false }, { status: 200 })
}
