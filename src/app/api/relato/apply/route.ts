// SIR V2 — POST /api/relato/apply
//
// Aplica una lista EXACTA de acciones (validadas por el cliente) sin re-llamar
// a Claude. Diseñado para el paso "Aplicar" del chat de /relato/ingest cuando
// el usuario destildó items específicos — queremos aplicar SOLO esos, no lo
// que devuelva un nuevo run de Claude.
//
// El endpoint valida cada acción con parseToolUse antes de ejecutar
// (defensa en profundidad contra clientes mal comportados).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseToolUse, type IngestAction } from '@/lib/relato-ingest/tools'
import { executeActions } from '@/lib/relato-ingest/execute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Body {
  actions?: unknown[]
}

function toRawToolUse(action: unknown): { name: string; input: Record<string, unknown> } | null {
  if (!action || typeof action !== 'object') return null
  const a = action as Record<string, unknown>
  const kind = typeof a.kind === 'string' ? a.kind : ''
  if (!kind) return null
  // Reconstruimos el input crudo tool_use según el kind (mapeo inverso de tools.ts).
  const input: Record<string, unknown> = {}
  switch (kind) {
    case 'crear_moment':
      input.person_full_name = a.personFullName
      input.title = a.title
      input.detail = a.detail
      input.occurred_on = a.occurredOn
      input.status = a.status
      if (a.followUpOn) input.follow_up_on = a.followUpOn
      if (a.resolution) input.resolution = a.resolution
      return { name: kind, input }
    case 'crear_person_log':
      input.person_full_name = a.personFullName
      input.kind = a.logKind
      input.value = a.value
      input.note = a.note
      input.logged_at = a.loggedAt
      return { name: kind, input }
    case 'crear_nota_manual':
      input.person_full_name = a.personFullName
      input.text = a.text
      input.observed_at = a.observedAt
      return { name: kind, input }
    case 'upsert_cumpleanos':
      input.person_full_name = a.personFullName
      input.date = a.date
      return { name: kind, input }
    case 'registrar_ciclo':
      input.person_full_name = a.personFullName
      input.date = a.date
      input.phase = a.phase
      input.confidence = a.confidence
      if (a.note) input.note = a.note
      return { name: kind, input }
    case 'crear_objetivo':
      input.title = a.title
      input.category = a.category
      input.priority = a.priority
      if (a.targetDate) input.target_date = a.targetDate
      if (a.nextStep) input.next_step = a.nextStep
      return { name: kind, input }
    case 'crear_persona':
      input.full_name = a.fullName
      input.relationship = a.relationship
      input.category = a.category
      if (a.notes) input.notes = a.notes
      return { name: kind, input }
    default:
      return null
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: Body
  try { body = (await req.json()) as Body } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!Array.isArray(body.actions)) return NextResponse.json({ error: 'actions[] requerido' }, { status: 400 })

  // Validar cada acción cliente → IngestAction canónico.
  const validated: IngestAction[] = []
  const invalid: number[] = []
  for (let i = 0; i < body.actions.length; i++) {
    const raw = toRawToolUse(body.actions[i])
    if (!raw) { invalid.push(i); continue }
    const parsed = parseToolUse(raw)
    if (!parsed || parsed.kind === 'flag_ambiguo') { invalid.push(i); continue }
    validated.push(parsed)
  }

  const executed = await executeActions(supabase, auth.user.id, validated)
  return NextResponse.json({ executed, invalid })
}
