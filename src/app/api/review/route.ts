// SIR V2 — GET/DELETE /api/review
// GET ?due=1 → cards con next_review_at <= now (o el count si count=1).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(status: number, error: string) { return NextResponse.json({ error }, { status }) }

const SELECT = 'id, question, answer, source_kind, source_ref, ease_factor, interval_days, next_review_at, reviews_count, streak, last_grade, last_reviewed_at'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const dueOnly = req.nextUrl.searchParams.get('due') === '1'
  const countOnly = req.nextUrl.searchParams.get('count') === '1'

  if (countOnly) {
    const { count } = await supabase.from('review_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.user.id).is('suspended_at', null)
      .lte('next_review_at', new Date().toISOString())
    return NextResponse.json({ due: count ?? 0 })
  }

  let q = supabase.from('review_cards').select(SELECT)
    .eq('user_id', auth.user.id).is('suspended_at', null)
    .order('next_review_at', { ascending: true }).limit(50)
  if (dueOnly) q = q.lte('next_review_at', new Date().toISOString())
  const { data } = await q
  return NextResponse.json({ cards: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return err(400, 'id requerido')
  await supabase.from('review_cards').delete().eq('user_id', auth.user.id).eq('id', id)
  return NextResponse.json({ ok: true })
}
