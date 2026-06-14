// SIR V2 — POST /api/self/rumbo (Narrative Intelligence Capa 2)
//
// Recibe los HITOS REALES de la trayectoria (buildLifeThread, client-side) y
// pide a Anthropic una reflexión breve y REFLEXIVA sobre el rumbo. El LLM no
// arma el hilo: sólo reformula los hitos provistos. Por eso se apoya en datos,
// no en invención.
//
// < 2 hitos → 422 (no hay hilo que reflexionar). Sin ANTHROPIC_API_KEY → 503
// (la reflexión es opcional; el hilo determinístico se ve igual sin ella).
//
// Body JSON: { milestones: [{ label, date, kind }] }
// Response 200: { insight: string }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  RUMBO_NARRATIVE_SYSTEM_PROMPT,
  buildRumboInput,
  parseRumboNarrative,
  type RumboMilestoneInput,
} from '@/lib/self/rumboPrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_MILESTONES = 24
const MAX_LABEL_CHARS = 200

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

function sanitizeMilestones(raw: unknown): RumboMilestoneInput[] {
  if (!Array.isArray(raw)) return []
  const out: RumboMilestoneInput[] = []
  for (const m of raw) {
    if (typeof m !== 'object' || m === null) continue
    const obj = m as Record<string, unknown>
    const label = typeof obj.label === 'string' ? obj.label.trim().slice(0, MAX_LABEL_CHARS) : ''
    const date = typeof obj.date === 'string' ? obj.date.trim() : ''
    const kind = typeof obj.kind === 'string' ? obj.kind.trim() : ''
    if (!label || !date) continue
    out.push({ label, date, kind })
    if (out.length >= MAX_MILESTONES) break
  }
  return out
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }

  const milestones = sanitizeMilestones(body.milestones)
  const anchor = typeof body.anchor === 'string' ? body.anchor.trim().slice(0, 200) : null
  if (milestones.length < 2) {
    return errorJson(
      422,
      'Hilo insuficiente',
      'Necesito al menos un par de hitos para reflexionar sobre tu rumbo. Se va tejiendo a medida que ponés y movés objetivos.',
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(
      503,
      'Reflexión no disponible',
      'Falta ANTHROPIC_API_KEY. El hilo de tu rumbo se ve igual sin la reflexión.',
    )
  }

  try {
    const client = new Anthropic({ maxRetries: 2 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 400,
      system: RUMBO_NARRATIVE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildRumboInput(milestones, anchor) }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const insight = parseRumboNarrative(text)
    if (!insight) {
      return errorJson(502, 'Respuesta vacía del modelo', 'Reintentá en unos segundos.')
    }
    return NextResponse.json({ insight }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo generar la reflexión', detail)
  }
}
