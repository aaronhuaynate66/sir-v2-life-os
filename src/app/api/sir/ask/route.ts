// SIR V2 — POST /api/sir/ask (#86 SIR conversacional · PR1 SOLO LECTURA)
//
// Q&A aterrizado sobre la data de Aaron. Este handler es SOLO TRANSPORTE: auth de
// sesión + rate-limit + parseo del body → delega el cerebro a askSir() (lib/sir/
// askSir.ts, reusado también por el webhook de Telegram) → traduce el resultado a
// HTTP. NO escribe nada más allá de lo que askSir persiste (el intercambio C3).
//
// Body JSON: { question, history?, personId?, dismissedGaps?, skipInlineGaps?, mode?, userContext? }
// Response 200: { answer, proposedAction, sources } | { answer, clarifying, proposedAction:null, sources }

import { NextResponse, type NextRequest } from 'next/server'

import { reportApiError } from '@/lib/observability/reportApiError'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { askSir, AskSirConfigError } from '@/lib/sir/askSir'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

interface ErrorBody { error: string; detail?: string }
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  const userId = authData.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return errorJson(400, 'Body JSON invalido') }
  if (typeof body.question !== 'string' || body.question.trim().length === 0) {
    return errorJson(400, 'question requerido (string no vacio)')
  }

  try {
    const result = await askSir({
      supabase,
      userId,
      question: body.question,
      history: Array.isArray(body.history) ? (body.history as Array<{ role?: unknown; text?: unknown }>) : undefined,
      personId: typeof body.personId === 'string' ? body.personId : null,
      dismissedGaps: Array.isArray(body.dismissedGaps)
        ? (body.dismissedGaps as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
      skipInlineGaps: body.skipInlineGaps === true,
      mode: body.mode === 'socratic' ? 'socratic' : null,
      userContext: typeof body.userContext === 'string' ? body.userContext : undefined,
    })
    return NextResponse.json(result, { status: 200 })
  } catch (e) {
    if (e instanceof AskSirConfigError) {
      return errorJson(500, e.message, e.detail)
    }
    reportApiError(e)
    return errorJson(502, 'No se pudo generar la respuesta', e instanceof Error ? e.message : String(e))
  }
}
