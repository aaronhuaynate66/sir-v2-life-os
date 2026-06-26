// SIR V2 — /api/people/money (Registro de plata por persona).
// GET ?person_id= → { entries }   POST/PATCH/DELETE
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapMoneyRow } from '@/lib/money/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const SEL = 'id, person_id, direction, amount, currency, concept, kind, occurred_on, occurred_time, op_ref, settled'
const ISO = /^\d{4}-\d{2}-\d{2}$/
function str(v: unknown, m: number): string | null { return typeof v === 'string' && v.trim() ? v.trim().slice(0, m) : null }
function dOr(v: unknown): string | null { return typeof v === 'string' && ISO.test(v.trim()) ? v.trim() : null }
function num(v: unknown): number | null { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : null }
function has(b: Record<string, unknown>, k: string) { return Object.prototype.hasOwnProperty.call(b, k) }

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const pid = req.nextUrl.searchParams.get('person_id')
  if (!pid) return NextResponse.json({ error: 'person_id requerido' }, { status: 400 })
  try {
    const { data } = await supabase.from('person_money').select(SEL).eq('user_id', auth.user.id).eq('person_id', pid).order('occurred_on', { ascending: true }).order('created_at', { ascending: true })
    return NextResponse.json({ entries: ((data ?? []) as Parameters<typeof mapMoneyRow>[0][]).map(mapMoneyRow) })
  } catch { return NextResponse.json({ entries: [] }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const pid = str(b.person_id, 80); const amount = num(b.amount)
  if (!pid || amount === null) return NextResponse.json({ error: 'person_id y amount requeridos' }, { status: 400 })
  const row = {
    user_id: auth.user.id, person_id: pid,
    direction: b.direction === 'in' ? 'in' : 'out',
    amount, currency: str(b.currency, 8) ?? 'PEN',
    concept: str(b.concept, 200),
    kind: b.kind === 'loan' ? 'loan' : b.kind === 'balance' ? 'balance' : 'transfer',
    occurred_on: dOr(b.occurred_on), occurred_time: str(b.occurred_time, 20), op_ref: str(b.op_ref, 60),
    settled: b.settled === true,
  }
  try {
    const { data, error } = await supabase.from('person_money').insert(row).select(SEL).single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    return NextResponse.json({ entry: mapMoneyRow(data as Parameters<typeof mapMoneyRow>[0]) })
  } catch (e) { return NextResponse.json({ error: 'No se pudo guardar', detail: String(e).slice(0, 120) }, { status: 500 }) }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const id = str(b.id, 60); if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (has(b, 'settled')) patch.settled = b.settled === true
  if (has(b, 'concept')) patch.concept = str(b.concept, 200)
  if (has(b, 'amount')) { const n = num(b.amount); if (n !== null) patch.amount = n }
  if (has(b, 'direction')) patch.direction = b.direction === 'in' ? 'in' : 'out'
  try {
    const { data, error } = await supabase.from('person_money').update(patch).eq('user_id', auth.user.id).eq('id', id).select(SEL).single()
    if (error) return NextResponse.json({ error: 'No se pudo actualizar', detail: error.message }, { status: 500 })
    return NextResponse.json({ entry: mapMoneyRow(data as Parameters<typeof mapMoneyRow>[0]) })
  } catch (e) { return NextResponse.json({ error: 'No se pudo actualizar', detail: String(e).slice(0, 120) }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  try { await supabase.from('person_money').delete().eq('user_id', auth.user.id).eq('id', id) } catch { /* */ }
  return NextResponse.json({ ok: true })
}
