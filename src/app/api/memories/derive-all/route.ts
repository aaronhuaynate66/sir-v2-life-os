// SIR V2 — POST /api/memories/derive-all (Etapa 2: cobertura de cobertura)
//
// Corre la derivación observations → memories para TODAS las personas del
// usuario, en lotes (batch) para no exceder el maxDuration del serverless.
// Reusa deriveForPerson (misma lógica que la ruta por-persona). El cliente
// pagina con `offset` hasta que `remaining` llega a 0; luego conviene re-indexar
// (/api/memories/embed) para vectorizar las memorias nuevas.
//
// Body JSON (opcional): { offset?: number, batch?: number }  (batch default 5, máx 10)
// Response 200: { total, offset, processed, nextOffset, remaining, peopleWithMemories, totals }

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { deriveForPerson, type DeriveResult } from '@/lib/memories/deriveForPerson'

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

const DEFAULT_BATCH = 5
const MAX_BATCH = 10

type Totals = Pick<DeriveResult, 'generated' | 'inserted' | 'refreshed' | 'suppressed'>

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response
  const userId = authData.user.id

  let offset = 0
  let batch = DEFAULT_BATCH
  try {
    const body = (await req.json().catch(() => ({}))) as { offset?: unknown; batch?: unknown }
    if (typeof body?.offset === 'number' && Number.isFinite(body.offset)) {
      offset = Math.max(0, Math.floor(body.offset))
    }
    if (typeof body?.batch === 'number' && Number.isFinite(body.batch)) {
      batch = Math.max(1, Math.min(MAX_BATCH, Math.floor(body.batch)))
    }
  } catch {
    // body opcional: usamos defaults
  }

  // Orden estable por id para que la paginación por offset sea consistente.
  const { data: peopleRows, error: peopleErr } = await supabase
    .from('people')
    .select('id')
    .eq('user_id', userId)
    .order('id', { ascending: true })
  if (peopleErr) {
    return errorJson(500, 'No se pudo listar las personas', peopleErr.message)
  }
  const ids = (peopleRows ?? []).map((r) => (r as { id: string }).id)
  const total = ids.length
  const slice = ids.slice(offset, offset + batch)

  const totals: Totals = { generated: 0, inserted: 0, refreshed: 0, suppressed: 0 }
  let peopleWithMemories = 0
  for (const personId of slice) {
    const outcome = await deriveForPerson(supabase, userId, personId)
    if (outcome.ok) {
      totals.generated += outcome.result.generated
      totals.inserted += outcome.result.inserted
      totals.refreshed += outcome.result.refreshed
      totals.suppressed += outcome.result.suppressed
      if (outcome.result.inserted > 0) peopleWithMemories += 1
    }
    // outcome.ok === false (404/422/500 por persona) se ignora: personas sin
    // observaciones o sin permiso no rompen el lote.
  }

  const processed = slice.length
  const nextOffset = offset + processed
  const remaining = Math.max(0, total - nextOffset)

  return NextResponse.json(
    { total, offset, processed, nextOffset, remaining, peopleWithMemories, totals },
    { status: 200 },
  )
}
