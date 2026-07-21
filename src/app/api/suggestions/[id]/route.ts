// SIR V2 — Ledger de sugerencias: actualizar el ciclo de vida (PATCH).
//
// Cierra el loop: cuando Aaron confirma/descarta una acción propuesta o da 👍/👎
// en el chat, se PERSISTE acá (antes era estado efímero de React). Sesión + RLS.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { normalizeStatus, normalizeFeedback, normalizeOutcome, isResolvedStatus } from '@/lib/suggestions/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  const status = normalizeStatus(body.status)
  if (status) {
    patch.status = status
    if (isResolvedStatus(status)) patch.resolved_at = new Date().toISOString()
  }
  if ('feedback' in body) patch.feedback = normalizeFeedback(body.feedback) // permite null (des-marcar)
  const outcome = normalizeOutcome(body.outcome)
  if (outcome) patch.outcome = outcome
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })

  // RLS limita el update a las filas del dueño; el .eq('id') acota a esta.
  const { error } = await supabase.from('suggestions').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'No se pudo actualizar', detail: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 200 })
}
