// SIR V2 — POST /api/objectives/plan (Hito 3: "Generar plan con IA")
//
// Recibe UN objetivo (título + descripción? + categoría? + fecha objetivo?) y
// pide a Anthropic un PLAN de pasos concretos, ordenados y con fechas sugeridas
// hasta la fecha objetivo. NO persiste nada: devuelve el plan propuesto para
// que el usuario lo revise/edite/acepte o descarte en la UI (review-before-save).
//
// Mismo patrón que /api/alignment/narrative: auth → rate limit ('generation')
// → check ANTHROPIC_API_KEY → Anthropic → parser tolerante → JSON.
//
// Body JSON: { title, description?, category?, targetDate?, target?, baseline?,
//             why?, context? }  (context = grounding ya resumido client-side)
// Response 200: { keyResults: [{ title, description?, tasks: [...] }], feasibility: string[] }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  OBJECTIVE_PLAN_SYSTEM_PROMPT,
  OBJECTIVE_PLAN_RETRY_NUDGE,
  buildPlanInput,
  parseObjectivePlan,
  parseFeasibilityNotes,
} from '@/lib/objectives/planPrompt'
import type { ProposedKeyResult } from '@/lib/objectives/planPrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Plan OKR jerárquico + grounding + feasibility: la generación de ~1.6k tokens
// con Sonnet supera el default (~10s) de funciones serverless → daba HTTP 504.
// 60s es el máximo del plan Hobby de Vercel y deja margen sobrado (~30-40s).
export const maxDuration = 60

const MODEL_ID = 'claude-sonnet-4-5-20250929'

// max_tokens es un TECHO, no un objetivo: el modelo para cuando termina, así que
// subirlo NO agrega latencia para una respuesta normal — sólo evita que un plan
// largo se TRUNQUE a la mitad (truncado → JSON inválido → "plan vacío"/502, que
// es lo que pasaba con 1600 para objetivos verbosos como los financieros). La
// latencia la acota maxDuration=60 + los topes de tamaño del prompt.
//
// 0050: cada tarea ahora trae acceptanceCriteria + effort + priority → el JSON
// crece ~40-60%. Subimos los techos para no volver a truncar planes verbosos.
const PLAN_MAX_TOKENS = 4500
// Reintento conciso: pedimos un plan más chico para que entre completo y rápido.
const RETRY_MAX_TOKENS = 3200

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

interface Attempt {
  text: string
  /** 'max_tokens' = la respuesta se truncó (causa típica de "plan vacío"). */
  truncated: boolean
}

/** Una llamada al modelo: devuelve el texto y si se truncó por max_tokens. */
async function runPlan(
  client: Anthropic,
  userMessage: string,
  maxTokens: number,
): Promise<Attempt> {
  const msg = await client.messages.create({
    model: MODEL_ID,
    max_tokens: maxTokens,
    system: OBJECTIVE_PLAN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })
  const textBlock = msg.content.find((b) => b.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
  return { text, truncated: msg.stop_reason === 'max_tokens' }
}

/** Hoy en date-only ISO (server-side; el plan no necesita TZ exacta del cliente). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
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
    return errorJson(400, 'Body JSON inválido')
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return errorJson(400, 'title requerido (string no vacío)')

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(
      503,
      'Generación no disponible',
      'Falta ANTHROPIC_API_KEY. Podés agregar los pasos a mano igual.',
    )
  }

  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)
  // Grounding (context): cap defensivo de tamaño — ya viene resumido client-side.
  const context = typeof body.context === 'string' ? body.context.slice(0, 4000) : undefined

  const input = {
    title,
    description: str(body.description),
    category: str(body.category),
    targetDate: str(body.targetDate),
    target: str(body.target),
    baseline: str(body.baseline),
    why: str(body.why),
    context,
    today: todayIso(),
  }

  const baseMessage = buildPlanInput(input)

  try {
    // Intento 1: techo alto para no truncar; maxRetries 1 cubre un 5xx/red
    // transitorio de Anthropic sin que lo vea el usuario.
    const client = new Anthropic({ maxRetries: 1 })
    let attempt = await runPlan(client, baseMessage, PLAN_MAX_TOKENS)
    let keyResults = parseObjectivePlan(attempt.text)

    // Intento 2 (sólo si el 1 no produjo plan: truncado, vacío o no-parseable).
    // Nudge: "JSON válido y COMPLETO, conciso, ≥3 KRs". Techo menor → más rápido
    // y con menos riesgo de truncar de nuevo. maxRetries 0 para acotar el tiempo
    // total bajo los 60s.
    if (keyResults.length === 0) {
      const retryClient = new Anthropic({ maxRetries: 0 })
      const retryMessage = `${baseMessage}\n\n${OBJECTIVE_PLAN_RETRY_NUDGE}`
      const retry = await runPlan(retryClient, retryMessage, RETRY_MAX_TOKENS)
      const retryKrs = parseObjectivePlan(retry.text)
      if (retryKrs.length > 0) {
        keyResults = retryKrs
        attempt = retry
      }
    }

    if (keyResults.length === 0) {
      // No tiramos una excepción: logueamos diagnóstico (sin el contenido, que
      // puede llevar data del grounding) y devolvemos un 502 claro.
      reportApiError(new Error('objectives/plan: plan vacío tras reintento'), {
        objectiveTitle: title,
        lastTruncated: attempt.truncated,
        lastTextLength: attempt.text.length,
      })
      return errorJson(
        502,
        'No se pudo armar el plan',
        'El modelo no devolvió un plan utilizable. Reintentá en unos segundos.',
      )
    }

    const feasibility = parseFeasibilityNotes(attempt.text)
    return NextResponse.json({ keyResults, feasibility } satisfies {
      keyResults: ProposedKeyResult[]
      feasibility: string[]
    }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo generar el plan', detail)
  }
}
