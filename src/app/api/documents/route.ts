// SIR V2 — /api/documents (Entregables, migración 0182)
//   GET    → lista. Filtros opcionales: ?personId= | ?objectiveId= | ?status=
//   POST   → crea o actualiza (upsert por id).
//   DELETE → borra por ?id=
//
// POR QUÉ EXISTE: Aaron, 2-ago-2026, *"así solo acá no me sirve"*. SIR le armaba
// entregables (un informe para FEDEPOL, una cotización) y quedaban en `docs/*.md`
// del repo, donde él no entra. No había NINGÚN lugar en la app para un documento.
//
// Patrón query directa + RLS, igual que `deals` (0084): sin store ni sync engine.

import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { filaADocumento, TIPOS, ESTADOS } from '@/lib/documentos/tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const MAX_BODY = 20_000

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}
function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return err(401, 'No autenticado')

  const sp = req.nextUrl.searchParams
  let q = supabase.from('documents').select('*').eq('user_id', user.id)
  const personId = str(sp.get('personId'), 64)
  const objectiveId = str(sp.get('objectiveId'), 64)
  const status = str(sp.get('status'), 20)
  if (personId) q = q.eq('person_id', personId)
  if (objectiveId) q = q.eq('objective_id', objectiveId)
  if (status) q = q.eq('status', status)

  const { data, error } = await q.order('updated_at', { ascending: false }).limit(200)
  // PostgREST no lanza: sin esto una columna mal escrita devolvería [] y el panel
  // diría "no hay documentos" cuando en realidad no pudo preguntar.
  if (error) return err(500, 'No se pudieron leer los documentos', error.message)
  return NextResponse.json({ documents: (data ?? []).map((r) => filaADocumento(r as Record<string, unknown>)) })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return err(401, 'No autenticado')

  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return err(400, 'JSON inválido') }

  const title = str(b.title, 200)
  if (!title) return err(400, 'Falta el título')

  const kind = TIPOS.includes(b.kind as never) ? (b.kind as string) : 'nota'
  const status = ESTADOS.includes(b.status as never) ? (b.status as string) : 'borrador'
  const ahora = new Date().toISOString()

  const fila: Record<string, unknown> = {
    id: str(b.id, 64) ?? `doc_${randomUUID()}`,
    user_id: user.id,
    title,
    kind,
    status,
    body: typeof b.body === 'string' ? b.body.slice(0, MAX_BODY) : '',
    internal_note: str(b.internalNote, MAX_BODY),
    person_id: str(b.personId, 64),
    objective_id: str(b.objectiveId, 64),
    deal_id: str(b.dealId, 64),
    updated_at: ahora,
    // Marcar "enviado" sella la fecha sola: si hay que acordarse de ponerla a
    // mano, no se pone, y el pendiente queda mal contado.
    ...(status === 'enviado' ? { sent_at: str(b.sentAt, 40) ?? ahora } : {}),
  }

  const { data, error } = await supabase.from('documents')
    .upsert(fila, { onConflict: 'id' }).select('*').maybeSingle()
  if (error) return err(500, 'No se pudo guardar', error.message)
  return NextResponse.json({ document: filaADocumento((data ?? {}) as Record<string, unknown>) })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return err(401, 'No autenticado')
  const id = str(req.nextUrl.searchParams.get('id'), 64)
  if (!id) return err(400, 'Falta el id')
  const { error } = await supabase.from('documents').delete().eq('user_id', user.id).eq('id', id)
  if (error) return err(500, 'No se pudo borrar', error.message)
  return NextResponse.json({ ok: true })
}
