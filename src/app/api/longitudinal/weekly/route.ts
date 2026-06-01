// SIR V2 — POST /api/longitudinal/weekly (Fase 3c)
//
// Genera (on-demand, RLS-scoped) un resumen SEMANAL accionable con patrones
// observados sobre el historial del usuario: person_logs + observations +
// memories + correlación lunar/ciclo. La lógica vive en
// lib/longitudinal/generate (compartida con el cron).
//
// Body JSON (opcional): { days?: number }  (default 7, máx 31)
// Response 201: { summary: LongitudinalSummary }

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { generateWeeklySummaryForUser } from '@/lib/longitudinal/generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

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

  let days = 7
  try {
    const body = (await req.json()) as { days?: unknown }
    if (typeof body?.days === 'number' && Number.isFinite(body.days)) {
      days = Math.max(1, Math.min(31, Math.floor(body.days)))
    }
  } catch {
    /* sin body -> default 7 */
  }

  const r = await generateWeeklySummaryForUser(supabase, authData.user.id, { days })

  switch (r.status) {
    case 'ok':
      return NextResponse.json({ summary: r.summary }, { status: 201 })
    case 'empty':
      return errorJson(422, 'Sin actividad en la ventana', r.detail)
    case 'no_api_key':
      return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
    case 'read_error':
      return errorJson(500, 'No se pudo leer el historial', r.detail)
    case 'llm_error':
      return errorJson(502, 'Falló la llamada al modelo de resumen', r.detail)
    case 'insert_error':
      return errorJson(500, 'No se pudo guardar el resumen', r.detail)
    default:
      return errorJson(500, 'Error inesperado', r.status)
  }
}
