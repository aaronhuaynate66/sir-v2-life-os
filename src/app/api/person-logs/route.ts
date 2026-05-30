// SIR V2 — POST /api/person-logs (Sesion 6)
//
// Inserta un row en `person_logs` (migration 0013). Backend de los dos
// paneles del detail page:
//   - RegistroRapidoPanel  -> kind ∈ {mood, energy, sleep, pain}
//   - RegistrarInteraccionPanel -> kind = 'interaction'
//
// Body JSON:
//   { person_id: string, kind: PersonLogKind, value: 1..5, note?: string }
//
// Response 201: { log: PersonLog }
//
// Seguridad (mismo patron que /api/memories/backfill + /api/observations/[id]):
//   1. createClient() server-side (cookies Supabase, RLS habilitada).
//   2. getUser() -> 401 si no hay sesion.
//   3. Person ownership: .eq('user_id', userId).eq('id', personId) ->
//      404 si la persona no existe O es ajena. NUNCA cross-user.
//   4. INSERT con user_id = userId verificado (NO `auth.uid()::text` —
//      RLS lo enforza, pero el value tambien va explicito por defense
//      in depth).

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import {
  PERSON_LOG_KINDS,
  type PersonLog,
  type PersonLogKind,
} from '@/lib/person-logs/types'
import { rowToPersonLog } from '@/lib/person-logs/fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

interface PostBody {
  person_id?: unknown
  kind?: unknown
  value?: unknown
  note?: unknown
}

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

const ALLOWED_KINDS: ReadonlySet<PersonLogKind> = new Set(PERSON_LOG_KINDS)

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  // 2. Body parse
  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }

  // 3. Validar person_id
  if (typeof body.person_id !== 'string' || body.person_id.length === 0) {
    return errorJson(400, 'person_id requerido (string no vacio)')
  }
  const personId = body.person_id

  // 4. Validar kind
  if (typeof body.kind !== 'string' || !ALLOWED_KINDS.has(body.kind as PersonLogKind)) {
    return errorJson(
      400,
      'kind invalido',
      `Esperado uno de: ${PERSON_LOG_KINDS.join(', ')}. Recibido: ${String(body.kind)}`,
    )
  }
  const kind = body.kind as PersonLogKind

  // 5. Validar value (1-5)
  if (
    typeof body.value !== 'number' ||
    !Number.isInteger(body.value) ||
    body.value < 1 ||
    body.value > 5
  ) {
    return errorJson(400, 'value invalido', 'Esperado entero en rango 1..5')
  }
  const value = body.value

  // 6. note opcional, trim + cap.
  let note: string | null = null
  if (typeof body.note === 'string') {
    const trimmed = body.note.trim()
    if (trimmed.length > 0) note = trimmed.slice(0, 500)
  }

  // 7. Person ownership — defensa explicita sobre RLS. 404 si ajena.
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) {
    return errorJson(500, 'No se pudo verificar la persona', personErr.message)
  }
  if (!personRow) {
    return errorJson(404, 'Persona no encontrada o sin permiso')
  }

  // 8. INSERT con user_id verificado.
  const { data, error } = await supabase
    .from('person_logs')
    .insert({
      user_id: userId,
      person_id: personId,
      kind,
      value,
      note,
    })
    .select('id, user_id, person_id, kind, value, note, logged_at, created_at')
    .single()

  if (error || !data) {
    return errorJson(500, 'No se pudo insertar el log', error?.message ?? 'sin data')
  }

  const log: PersonLog = rowToPersonLog(data as Record<string, unknown>)
  return NextResponse.json({ log }, { status: 201 })
}
