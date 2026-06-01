// SIR V2 — POST /api/alignment/narrative (Etapa 4: capa narrativa de Alineación)
//
// Recibe UN objetivo + su estado de alineación + señales YA computadas con
// datos reales por el alignment engine (client-side), y pide a Anthropic un
// insight breve y REFLEXIVO. El LLM no decide la brecha: sólo reformula las
// señales provistas. Por eso el veredicto se apoya en datos, no en invención.
//
// Si el estado es 'insufficient_data' o no hay señales → 422 (no llamamos al
// LLM, no inventamos una brecha). Sin ANTHROPIC_API_KEY → 503 (la narrativa
// es opcional; el estado/seññales igual se muestran sin ella).
//
// Body JSON: { title, category, description?, state, linkedPersonNames?, signals: [{label, concern}] }
// Response 200: { insight: string }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import {
  ALIGNMENT_NARRATIVE_SYSTEM_PROMPT,
  buildAlignmentInput,
  parseAlignmentNarrative,
  type AlignmentNarrativeInput,
} from '@/lib/alignment/narrativePrompt'
import type { AlignmentState, ConcernLevel } from '@/engines/alignment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-sonnet-4-5-20250929'

const VALID_STATES: readonly AlignmentState[] = [
  'aligned',
  'drifting',
  'needs_attention',
  'insufficient_data',
]

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

function sanitizeSignals(raw: unknown): Array<{ label: string; concern: ConcernLevel }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ label: string; concern: ConcernLevel }> = []
  for (const s of raw) {
    if (typeof s !== 'object' || s === null) continue
    const obj = s as Record<string, unknown>
    const label = typeof obj.label === 'string' ? obj.label.trim() : ''
    const concern = obj.concern
    if (!label) continue
    if (concern !== 0 && concern !== 1 && concern !== 2) continue
    out.push({ label, concern })
  }
  return out
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return errorJson(400, 'title requerido (string no vacio)')

  const state = body.state
  if (typeof state !== 'string' || !VALID_STATES.includes(state as AlignmentState)) {
    return errorJson(400, 'state invalido')
  }
  if (state === 'insufficient_data') {
    return errorJson(
      422,
      'Datos insuficientes',
      'No hay señales suficientes para una reflexión honesta. Vinculá personas y registrá contacto/estado.',
    )
  }

  const signals = sanitizeSignals(body.signals)
  if (signals.length === 0) {
    return errorJson(422, 'Sin señales', 'No se recibieron señales observadas para reformular.')
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(
      503,
      'Narrativa no disponible',
      'Falta ANTHROPIC_API_KEY. El estado y las señales se muestran igual sin la reflexión.',
    )
  }

  const input: AlignmentNarrativeInput = {
    title,
    category: typeof body.category === 'string' ? body.category : 'personal',
    description: typeof body.description === 'string' ? body.description : undefined,
    state: state as AlignmentState,
    linkedPersonNames: Array.isArray(body.linkedPersonNames)
      ? (body.linkedPersonNames as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    signals,
  }

  try {
    const client = new Anthropic({ maxRetries: 2 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 400,
      system: ALIGNMENT_NARRATIVE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildAlignmentInput(input) }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const insight = parseAlignmentNarrative(text)
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
