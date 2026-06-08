// SIR V2 — POST /api/memories/derive (camino ADITIVO: observations → memories)
//
// Materializa memorias en `memories` a partir de las observations curadas de UNA
// persona. La lógica vive en src/lib/memories/deriveForPerson.ts (compartida con
// /api/memories/derive-all). Esta ruta solo resuelve auth + rate limit + parse y
// traduce el resultado a HTTP.
//
// Body JSON: { person_id: string }
// Response 200: { generated, inserted, skipped, alreadyCovered, usedLlm, refreshed, suppressed }

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { deriveForPerson } from '@/lib/memories/deriveForPerson'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

  const outcome = await deriveForPerson(supabase, userId, body.person_id)
  if (!outcome.ok) {
    return errorJson(outcome.status, outcome.error, outcome.detail)
  }
  return NextResponse.json(outcome.result, { status: 200 })
}
