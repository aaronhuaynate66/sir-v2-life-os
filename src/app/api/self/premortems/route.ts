// SIR V2 — /api/self/premortems (Pre-mortem guardado + revisión).
// Guarda la decisión + lo que SIR proyectó, y después permite registrar qué pasó
// realmente (outcome) para volver y comparar predicción vs realidad.
// premortems no está en el tipo generado → .from() compila igual.
// GET    → últimos pre-mortems
// POST   { decision, projection }   → guarda
// PATCH  { id, outcome }            → registra qué pasó (marca reviewed_at)
// DELETE ?id=
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT = 'id, decision, projection, outcome, created_at, reviewed_at'

interface Row { id: string; decision: string; projection: string; outcome: string | null; created_at: string; reviewed_at: string | null }
function map(r: Row) {
  return { id: r.id, decision: r.decision, projection: r.projection, outcome: r.outcome, createdAt: r.created_at, reviewedAt: r.reviewed_at }
}
function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const { data } = await supabase.from('premortems').select(SELECT).eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(50)
    return NextResponse.json({ premortems: ((data ?? []) as Row[]).map(map) })
  } catch { return NextResponse.json({ premortems: [] }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const decision = str(b.decision, 600)
  const projection = str(b.projection, 4000)
  if (!decision || !projection) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  try {
    const { data, error } = await supabase.from('premortems').insert({ user_id: auth.user.id, decision, projection }).select(SELECT).single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    return NextResponse.json({ premortem: map(data as Row) })
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
  const outcome = 'outcome' in b ? str(b.outcome, 4000) : undefined
  const patch: Record<string, unknown> = {}
  if (outcome !== undefined) { patch.outcome = outcome; patch.reviewed_at = outcome ? new Date().toISOString() : null }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  try {
    const { data, error } = await supabase.from('premortems').update(patch).eq('user_id', auth.user.id).eq('id', id).select(SELECT).single()
    if (error) return NextResponse.json({ error: 'No se pudo actualizar', detail: error.message }, { status: 500 })
    return NextResponse.json({ premortem: map(data as Row) })
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
  try { await supabase.from('premortems').delete().eq('user_id', auth.user.id).eq('id', id) } catch { /* */ }
  return NextResponse.json({ ok: true })
}
