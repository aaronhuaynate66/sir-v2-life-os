// SIR V2 — GET /api/daily-actions (GEMA A+B).
//
// "Qué hacer hoy con quién." El ensamblado (data real + motores puros) vive en
// `@/lib/daily-actions/assemble` (compartido con el push de la mañana, para que
// el nudge por push/Telegram coincida con lo que ves acá). NO llama al LLM → sin
// riesgo de timeout/502. El mensaje copiable se pide aparte a /message.
//
// Lecturas RLS-scoped (+ .eq('user_id') defensivo en el helper). Sin escrituras.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { assembleDailyActions } from '@/lib/daily-actions/assemble'
import type { DailyAction } from '@/lib/daily-actions/build'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

interface DailyActionsResponse {
  actions: DailyAction[]
  /** Disponibilidad del usuario 0-100 | null (de self_metrics). */
  availability: number | null
  generatedAt: string
}

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const userId = authData.user.id
  const now = new Date()

  // Modo enfocado opcional (retrocompatible: sin params = comportamiento previo).
  const url = new URL(request.url)
  const isReconnect = url.searchParams.get('focus') === 'reconnect'
  const limit = parseLimit(url.searchParams.get('limit'), isReconnect ? 5 : 6)

  try {
    const { actions, availability } = await assembleDailyActions(supabase, userId, now, {
      focus: isReconnect ? 'reconnect' : undefined,
      limit,
    })
    const body: DailyActionsResponse = { actions, availability, generatedAt: now.toISOString() }
    return NextResponse.json(body, { status: 200 })
  } catch (e) {
    reportApiError(e, { route: 'daily-actions' })
    return NextResponse.json({ error: 'No se pudieron generar las acciones del día' }, { status: 500 })
  }
}

/** Límite de tarjetas desde el query param, acotado a [1..12]. Fallback al
 *  default si viene ausente o no-numérico. */
function parseLimit(raw: string | null, fallback: number): number {
  const n = raw == null ? NaN : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(12, Math.floor(n)))
}
