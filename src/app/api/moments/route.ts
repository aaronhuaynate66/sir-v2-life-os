// SIR V2 — /api/moments (Momentos / Decisiones relacionales).
// relationship_moments no está en el tipo generado → .from() compila igual.
// GET    ?person_id=  → momentos de esa persona (recientes primero)
//        ?open=1      → todos los momentos ABIERTOS del usuario (para brief/recordatorio)
// POST   { person_id, title, detail?, occurred_on?, follow_up_on? }
// PATCH  { id, status?, resolution?, title?, detail?, follow_up_on? }
// DELETE ?id=
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapMomentRow } from '@/lib/moments/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT = 'id, person_id, title, detail, status, occurred_on, follow_up_on, resolution, created_at, updated_at'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const personId = req.nextUrl.searchParams.get('person_id')
  const onlyOpen = req.nextUrl.searchParams.get('open') === '1'
  try {
    let q = supabase.from('relationship_moments').select(SELECT).eq('user_id', auth.user.id)
    if (personId) q = q.eq('person_id', personId)
    if (onlyOpen) q = q.eq('status', 'abierto')
    const { data } = await q.order('occurred_on', { ascending: false }).limit(100)
    return NextResponse.json({ moments: (data ?? []).map(mapMomentRow) })
  } catch { return NextResponse.json({ moments: [] }) }
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null
}
const ISO = /^\d{4}-\d{2}-\d{2}$/
function dateOrNull(v: unknown): string | null {
  return typeof v === 'string' && ISO.test(v.trim()) ? v.trim() : null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const personId = str(b.person_id, 60)
  const title = str(b.title, 200)
  if (!personId || !title) return NextResponse.json({ error: 'person_id y title requeridos' }, { status: 400 })
  // Ownership de la persona.
  const { data: prow } = await supabase.from('people').select('id').eq('user_id', auth.user.id).eq('id', personId).maybeSingle()
  if (!prow) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 })
  const row: Record<string, unknown> = {
    user_id: auth.user.id, person_id: personId, title,
    detail: str(b.detail, 2000),
    status: 'abierto',
    follow_up_on: dateOrNull(b.follow_up_on),
  }
  const occurred = dateOrNull(b.occurred_on)
  if (occurred) row.occurred_on = occurred
  try {
    const { data, error } = await supabase.from('relationship_moments').insert(row).select(SELECT).single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    return NextResponse.json({ moment: mapMomentRow(data) })
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
  if (b.status === 'abierto' || b.status === 'resuelto') patch.status = b.status
  if ('resolution' in b) patch.resolution = str(b.resolution, 2000)
  if ('title' in b) { const t = str(b.title, 200); if (t) patch.title = t }
  if ('detail' in b) patch.detail = str(b.detail, 2000)
  if ('follow_up_on' in b) patch.follow_up_on = dateOrNull(b.follow_up_on)
  try {
    const { data, error } = await supabase.from('relationship_moments').update(patch).eq('user_id', auth.user.id).eq('id', id).select(SELECT).single()
    if (error) return NextResponse.json({ error: 'No se pudo actualizar', detail: error.message }, { status: 500 })
    return NextResponse.json({ moment: mapMomentRow(data) })
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
  try { await supabase.from('relationship_moments').delete().eq('user_id', auth.user.id).eq('id', id) } catch { /* */ }
  return NextResponse.json({ ok: true })
}
