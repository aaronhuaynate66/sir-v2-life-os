// SIR V2 — POST /api/sir/ask (#86 SIR conversacional · PR1 SOLO LECTURA)
//
// Q&A aterrizado sobre la data de Aaron. Este handler es SOLO TRANSPORTE: auth de
// sesión + rate-limit + parseo del body → delega el cerebro a askSir() (lib/sir/
// askSir.ts, reusado también por el webhook de Telegram) → traduce el resultado a
// HTTP. NO escribe nada más allá de lo que askSir persiste (el intercambio C3).
//
// Body JSON: { question, history?, personId?, dismissedGaps?, skipInlineGaps?, mode?, userContext? }
// Response 200: { answer, proposedAction, sources } | { answer, clarifying, proposedAction:null, sources }

import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'

import { reportApiError } from '@/lib/observability/reportApiError'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { askSir, AskSirConfigError } from '@/lib/sir/askSir'
import { appendSirThread } from '@/lib/sir/thread'

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
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
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
    // Hilo unificado (Fase 2): persisto el intercambio al hilo canónico para que
    // Telegram (y otros dispositivos) vean lo hablado acá. Fail-open. Los `at`
    // persistidos vuelven al cliente para que el polling no re-agregue estos
    // mismos turnos (dedup del hilo unificado).
    const persisted = await appendSirThread(supabase, userId, 'web', body.question as string, result.answer)

    // Ledger (cerebro): si SIR propuso una ACCIÓN, la registramos como sugerencia
    // 'pending'. El chat persiste luego si se confirmó/descartó (cierra el loop
    // que antes era estado efímero de React). Fail-open: no rompe la respuesta.
    let suggestionId: string | null = null
    const proposed = (result as { proposedAction?: { kind?: unknown } | null }).proposedAction
    if (proposed && typeof proposed.kind === 'string') {
      const sid = `sug_${createHash('sha1').update(`${userId}|${Date.now()}|${Math.random()}`).digest('hex').slice(0, 24)}`
      const { error: sErr } = await supabase.from('suggestions').insert({
        id: sid, user_id: userId, surface: 'chat', kind: proposed.kind,
        title: typeof body.question === 'string' ? (body.question as string).slice(0, 120) : null,
        payload: proposed, status: 'pending',
      })
      if (!sErr) suggestionId = sid
    }
    return NextResponse.json({ ...result, thread: persisted, suggestionId }, { status: 200 })
  } catch (e) {
    if (e instanceof AskSirConfigError) {
      return errorJson(500, e.message, e.detail)
    }
    reportApiError(e)
    return errorJson(502, 'No se pudo generar la respuesta', e instanceof Error ? e.message : String(e))
  }
}
