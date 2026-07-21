// SIR V2 — Ledger de sugerencias: crear (POST) + listar (GET).
//
// POST crea una sugerencia (ej. un 👍/👎 sobre una respuesta del chat que no
// tenía una acción propuesta pre-registrada). GET lista las recientes (para el
// panel "qué está aprendiendo SIR", futuro). Sesión + RLS owner-only. Fail-open.

import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { normalizeSurface, normalizeFeedback, rowToSuggestion } from '@/lib/suggestions/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function newId(): string {
  // sha1 de aleatoriedad del server + ahora → id estable 'sug_...'. (No usamos
  // Math.random en workflows, pero esto es una ruta normal de Node.)
  return `sug_${createHash('sha1').update(`${Date.now()}|${Math.random()}`).digest('hex').slice(0, 24)}`
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data } = await supabase
    .from('suggestions')
    .select('id, surface, kind, title, status, feedback, outcome, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(200)
  return NextResponse.json({ items: (data ?? []).map((r) => rowToSuggestion(r as Record<string, unknown>)) }, { status: 200 })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const kind = typeof body.kind === 'string' && body.kind.trim() ? body.kind.trim().slice(0, 60) : 'answer'
  const feedback = normalizeFeedback(body.feedback)
  const id = newId()
  const row = {
    id,
    user_id: auth.user.id,
    surface: normalizeSurface(body.surface),
    kind,
    title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
    payload: body.payload ?? null,
    status: 'pending' as const,
    feedback,
  }
  const { error } = await supabase.from('suggestions').insert(row)
  if (error) return NextResponse.json({ error: 'No se pudo registrar', detail: error.message }, { status: 500 })
  return NextResponse.json({ id }, { status: 200 })
}
