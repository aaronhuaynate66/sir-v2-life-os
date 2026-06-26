// SIR V2 — /api/objectives/plan (Plan de acción del objetivo).
// GET    ?goal_id=  → { plan, blockers }
// PUT    { goal_id, event_date?, travel_start?, travel_end?, location?, notes? }  (upsert plan)
// POST   { goal_id, title, due_on? }   (nuevo bloqueo)
// PATCH  { id, done?, title?, due_on? } (editar bloqueo)
// DELETE ?id=  (bloqueo)
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapPlanRow, mapBlockerRow } from '@/lib/objectives/plan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const PLAN_SEL = 'goal_id, event_date, travel_start, travel_end, location, notes, obstacle, plan_if, plan_then'
const BLK_SEL = 'id, goal_id, title, due_on, done, sort'
function str(v: unknown, max: number): string | null { return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null }
function dateOrNull(v: unknown): string | null { return typeof v === 'string' && ISO.test(v.trim()) ? v.trim() : null }
function has(b: Record<string, unknown>, k: string): boolean { return Object.prototype.hasOwnProperty.call(b, k) }

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const goalId = req.nextUrl.searchParams.get('goal_id')
  if (!goalId) return NextResponse.json({ error: 'goal_id requerido' }, { status: 400 })
  let plan = null, blockers: unknown[] = []
  try {
    const { data } = await supabase.from('objective_plan').select(PLAN_SEL).eq('user_id', auth.user.id).eq('goal_id', goalId).maybeSingle()
    if (data) plan = mapPlanRow(data as Parameters<typeof mapPlanRow>[0])
  } catch { /* */ }
  try {
    const { data } = await supabase.from('objective_blockers').select(BLK_SEL).eq('user_id', auth.user.id).eq('goal_id', goalId).order('sort', { ascending: true }).order('created_at', { ascending: true })
    blockers = ((data ?? []) as Parameters<typeof mapBlockerRow>[0][]).map(mapBlockerRow)
  } catch { /* */ }
  return NextResponse.json({ plan, blockers })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const goalId = str(b.goal_id, 80)
  if (!goalId) return NextResponse.json({ error: 'goal_id requerido' }, { status: 400 })
  const row: Record<string, unknown> = { user_id: auth.user.id, goal_id: goalId, updated_at: new Date().toISOString() }
  if (has(b, 'event_date')) row.event_date = dateOrNull(b.event_date)
  if (has(b, 'travel_start')) row.travel_start = dateOrNull(b.travel_start)
  if (has(b, 'travel_end')) row.travel_end = dateOrNull(b.travel_end)
  if (has(b, 'location')) row.location = str(b.location, 200)
  if (has(b, 'notes')) row.notes = str(b.notes, 2000)
  if (has(b, 'obstacle')) row.obstacle = str(b.obstacle, 600)
  if (has(b, 'plan_if')) row.plan_if = str(b.plan_if, 400)
  if (has(b, 'plan_then')) row.plan_then = str(b.plan_then, 400)
  try {
    const { data, error } = await supabase.from('objective_plan').upsert(row, { onConflict: 'user_id,goal_id' }).select(PLAN_SEL).single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    return NextResponse.json({ plan: mapPlanRow(data as Parameters<typeof mapPlanRow>[0]) })
  } catch (e) { return NextResponse.json({ error: 'No se pudo guardar', detail: String(e).slice(0, 120) }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const goalId = str(b.goal_id, 80); const title = str(b.title, 200)
  if (!goalId || !title) return NextResponse.json({ error: 'goal_id y title requeridos' }, { status: 400 })
  try {
    const { data, error } = await supabase.from('objective_blockers').insert({ user_id: auth.user.id, goal_id: goalId, title, due_on: dateOrNull(b.due_on) }).select(BLK_SEL).single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    return NextResponse.json({ blocker: mapBlockerRow(data as Parameters<typeof mapBlockerRow>[0]) })
  } catch (e) { return NextResponse.json({ error: 'No se pudo guardar', detail: String(e).slice(0, 120) }, { status: 500 }) }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const id = str(b.id, 60)
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (has(b, 'done')) patch.done = !!b.done
  if (has(b, 'title')) { const t = str(b.title, 200); if (t) patch.title = t }
  if (has(b, 'due_on')) patch.due_on = dateOrNull(b.due_on)
  try {
    const { data, error } = await supabase.from('objective_blockers').update(patch).eq('user_id', auth.user.id).eq('id', id).select(BLK_SEL).single()
    if (error) return NextResponse.json({ error: 'No se pudo actualizar', detail: error.message }, { status: 500 })
    return NextResponse.json({ blocker: mapBlockerRow(data as Parameters<typeof mapBlockerRow>[0]) })
  } catch (e) { return NextResponse.json({ error: 'No se pudo actualizar', detail: String(e).slice(0, 120) }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  try { await supabase.from('objective_blockers').delete().eq('user_id', auth.user.id).eq('id', id) } catch { /* */ }
  return NextResponse.json({ ok: true })
}
