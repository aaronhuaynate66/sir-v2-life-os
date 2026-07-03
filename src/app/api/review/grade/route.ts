// SIR V2 — POST /api/review/grade
// Body: { id, grade: 0|1|2|3 }
// Actualiza next_review_at, interval_days, ease_factor con SM-2.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyReview, type ReviewGrade } from '@/lib/review/sm2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(status: number, error: string) { return NextResponse.json({ error }, { status }) }

const DAY_MS = 86_400_000

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  let body: { id?: unknown; grade?: unknown }
  try { body = await req.json() as typeof body } catch { return err(400, 'Body inválido') }
  const id = typeof body.id === 'string' ? body.id : ''
  const grade = body.grade
  if (!id) return err(400, 'id requerido')
  if (grade !== 0 && grade !== 1 && grade !== 2 && grade !== 3) return err(400, 'grade debe ser 0..3')

  const { data: cardRow } = await supabase.from('review_cards')
    .select('id, ease_factor, interval_days, streak')
    .eq('user_id', auth.user.id).eq('id', id).maybeSingle()
  if (!cardRow) return err(404, 'Card no encontrada')
  const card = cardRow as { id: string; ease_factor: number; interval_days: number; streak: number }

  const outcome = applyReview({
    intervalDays: card.interval_days,
    easeFactor: card.ease_factor,
    streak: card.streak,
  }, grade as ReviewGrade)

  const nextAt = new Date(Date.now() + outcome.nextReviewInDays * DAY_MS).toISOString()
  await supabase.from('review_cards').update({
    ease_factor: outcome.easeFactor,
    interval_days: outcome.intervalDays,
    streak: outcome.streak,
    next_review_at: nextAt,
    last_grade: grade,
    last_reviewed_at: new Date().toISOString(),
    reviews_count: card.streak + 1,
    updated_at: new Date().toISOString(),
  }).eq('user_id', auth.user.id).eq('id', id)

  return NextResponse.json({ ok: true, nextReviewInDays: outcome.nextReviewInDays })
}
