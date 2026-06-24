// SIR V2 — /api/objectives/costs. Costos materiales/esfuerzo de un objetivo.
// goal_costs no está en el tipo generado → .from() directo. RLS.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const SELECT = 'id, goal_id, label, amount, currency, kind'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const goalId = req.nextUrl.searchParams.get('goal_id')
  if (!goalId) return NextResponse.json({ costs: [] })
  try {
    const { data } = await supabase.from('goal_costs').select(SELECT).eq('user_id', auth.user.id).eq('goal_id', goalId).order('created_at', { ascending: true })
    return NextResponse.json({ costs: data ?? [] })
  } catch { return NextResponse.json({ costs: [] }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const goalId = typeof b.goal_id === 'string' ? b.goal_id : ''
  const label = typeof b.label === 'string' ? b.label.trim().slice(0, 120) : ''
  if (!goalId || !label) return NextResponse.json({ error: 'goal_id y label requeridos' }, { status: 400 })
  const amount = typeof b.amount === 'number' && isFinite(b.amount) && b.amount >= 0 ? b.amount : null
  const currency = typeof b.currency === 'string' ? b.currency.slice(0, 8) : 'PEN'
  const kind = b.kind === 'esfuerzo' ? 'esfuerzo' : 'material'
  try {
    const { data, error } = await supabase.from('goal_costs').insert({ user_id: auth.user.id, goal_id: goalId, label, amount, currency, kind }).select(SELECT).single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    return NextResponse.json({ cost: data })
  } catch (e) { return NextResponse.json({ error: 'No se pudo guardar', detail: String(e).slice(0, 120) }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  try { await supabase.from('goal_costs').delete().eq('user_id', auth.user.id).eq('id', id) } catch { /* */ }
  return NextResponse.json({ ok: true })
}
