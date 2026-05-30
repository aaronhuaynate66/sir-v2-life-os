// SIR V2 — POST /api/memories/backfill
//
// Sesion 4 (Memorias asociadas, PR #2 sidebar).
//
// Toma una persona del usuario y materializa sus relationships.history
// como rows en `memories` via backfillMemoriesForPerson (extract.ts).
// Idempotente: el unique index (user_id, source_event_id) de la
// migration 0012 dedupea via ON CONFLICT DO NOTHING, asi que re-correr
// el endpoint no duplica memorias.
//
// Body JSON: { person_id: string }
// Response 200: { generated, inserted, skipped }
//
// Seguridad (mismo patron que /api/observations/[id]):
//   - createClient() server-side (cookies de Supabase, RLS habilitada).
//   - getUser() -> 401 si no hay sesion.
//   - Lookup de la persona con .eq('user_id', userId) explicito. RLS
//     filtra; el .eq es defensivo. Si no devuelve row -> 404 (la persona
//     no existe O no le pertenece al user). NUNCA cross-user.
//   - Lookup de relationships con .eq('user_id', userId) + .eq('person_id').
//     Mismo guardrail.
//   - backfillMemoriesForPerson recibe el mismo supabase client (mismo
//     auth context) y el userId verificado.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { backfillMemoriesForPerson } from '@/lib/memories/extract'
import { personAdapter } from '@/lib/supabase/sync'
import type { Person, RelationshipEvent } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface PostBody {
  person_id?: unknown
}

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  // 2. Body
  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }
  if (typeof body.person_id !== 'string' || body.person_id.length === 0) {
    return errorJson(400, 'person_id requerido (string no vacio)')
  }
  const personId = body.person_id

  // 3. Cargar persona — user-scoped (RLS + .eq defensivo). 404 si ajena.
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) {
    return errorJson(500, 'No se pudo leer la persona', personErr.message)
  }
  if (!personRow) {
    return errorJson(404, 'Persona no encontrada o sin permiso')
  }
  const person: Person = personAdapter.fromRow(personRow as Record<string, unknown>)

  // 4. Cargar relationships.history de esa persona. La tabla relationships
  //    tiene (user_id, person_id) — puede haber 0 o 1 row por persona. RLS +
  //    .eq defensivo, mismo guardrail.
  const { data: relRow, error: relErr } = await supabase
    .from('relationships')
    .select('history')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .maybeSingle()
  if (relErr) {
    return errorJson(500, 'No se pudo leer relationships.history', relErr.message)
  }

  const history: RelationshipEvent[] = Array.isArray(relRow?.history)
    ? (relRow.history as RelationshipEvent[])
    : []

  // 5. Backfill (idempotente — el unique index de 0012 hace ON CONFLICT
  //    DO NOTHING). Si history esta vacio, devuelve { generated: 0, ... }.
  try {
    const result = await backfillMemoriesForPerson(supabase, userId, person, history)
    return NextResponse.json(
      {
        insertedCount: result.inserted,
        generated: result.generated,
        skipped: result.skipped,
      },
      { status: 200 },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(500, 'Backfill de memorias fallo', msg.slice(0, 300))
  }
}
