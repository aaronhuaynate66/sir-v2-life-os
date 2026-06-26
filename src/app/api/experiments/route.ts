// SIR V2 — /api/experiments (Loop de Experimentos · Motor #2).
// experiments no está en el tipo generado → .from() compila igual.
// GET    ?status=activo  → lista (todos, o filtrados por estado)
// POST   { title, detail?, source?, week_start? }   → crea (status 'activo')
// PATCH  { id, status?, result?, title?, detail? }
// DELETE ?id=
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapExperimentRow } from '@/lib/experiments/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT = 'id, title, detail, source, status, week_start, result, worked, created_at, updated_at'
const ISO = /^\d{4}-\d{2}-\d{2}$/

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null
}
function dateOrNull(v: unknown): string | null {
  return typeof v === 'string' && ISO.test(v.trim()) ? v.trim() : null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const status = req.nextUrl.searchParams.get('status')
  try {
    let q = supabase.from('experiments').select(SELECT).eq('user_id', auth.user.id)
    if (status === 'activo' || status === 'hecho' || status === 'descartado') q = q.eq('status', status)
    const { data } = await q.order('created_at', { ascending: false }).limit(100)
    return NextResponse.json({ experiments: ((data ?? []) as Parameters<typeof mapExperimentRow>[0][]).map(mapExperimentRow) })
  } catch { return NextResponse.json({ experiments: [] }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const title = str(b.title, 200)
  if (!title) return NextResponse.json({ error: 'title requerido' }, { status: 400 })
  const row: Record<string, unknown> = {
    user_id: auth.user.id,
    title,
    detail: str(b.detail, 2000),
    source: b.source === 'espejo' ? 'espejo' : 'manual',
    status: 'activo',
    week_start: dateOrNull(b.week_start),
  }
  try {
    const { data, error } = await supabase.from('experiments').insert(row).select(SELECT).single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    return NextResponse.json({ experiment: mapExperimentRow(data) })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo guardar', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const id = str(b.id, 60)
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.status === 'activo' || b.status === 'hecho' || b.status === 'descartado') patch.status = b.status
  if ('result' in b) patch.result = str(b.result, 2000)
  if ('worked' in b) { const w = typeof b.worked === 'string' ? b.worked : null; patch.worked = (w === 'si' || w === 'no' || w === 'parcial') ? w : null }
  if ('title' in b) { const t = str(b.title, 200); if (t) patch.title = t }
  if ('detail' in b) patch.detail = str(b.detail, 2000)
  try {
    const { data, error } = await supabase.from('experiments').update(patch).eq('user_id', auth.user.id).eq('id', id).select(SELECT).single()
    if (error) return NextResponse.json({ error: 'No se pudo actualizar', detail: error.message }, { status: 500 })
    return NextResponse.json({ experiment: mapExperimentRow(data) })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo actualizar', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  try { await supabase.from('experiments').delete().eq('user_id', auth.user.id).eq('id', id) } catch { /* */ }
  return NextResponse.json({ ok: true })
}
