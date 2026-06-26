// SIR V2 — POST /api/habits/checkin (Etapa 3)
// Toggle del checkin de HOY para un hábito: si no existe lo crea, si existe lo
// borra (des-marcar). Idempotente por (user, hábito, día). Auth + RLS.
// Body: { habit_id: string }  Response: { done: boolean }

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { limaDayString } from '@/lib/habits/streak'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const userId = auth.user.id

  let body: { habit_id?: unknown; date?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return err(400, 'Body JSON inválido')
  }
  const habitId = typeof body.habit_id === 'string' ? body.habit_id : ''
  if (!habitId) return err(400, 'habit_id requerido')

  // Fecha opcional (backfill de días pasados). Default hoy. No se permite futuro
  // ni más de 60 días atrás (evita marcar cualquier cosa).
  const todayISO = limaDayString(new Date())
  let target = todayISO
  if (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    if (body.date > todayISO) return err(400, 'No se puede marcar un día futuro')
    const ageDays = Math.floor((Date.parse(todayISO) - Date.parse(body.date)) / 86_400_000)
    if (ageDays > 60) return err(400, 'Solo se puede marcar hasta 60 días atrás')
    target = body.date
  }

  // Ownership del hábito.
  const { data: habit, error: hErr } = await supabase
    .from('habits')
    .select('id')
    .eq('user_id', userId)
    .eq('id', habitId)
    .maybeSingle()
  if (hErr) return err(500, 'No se pudo verificar el hábito', hErr.message)
  if (!habit) return err(404, 'Hábito no encontrado')

  const { data: existing } = await supabase
    .from('habit_checkins')
    .select('id')
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .eq('date', target)
    .maybeSingle()

  if (existing) {
    const { error: delErr } = await supabase
      .from('habit_checkins')
      .delete()
      .eq('user_id', userId)
      .eq('id', (existing as { id: string }).id)
    if (delErr) return err(500, 'No se pudo desmarcar', delErr.message)
    return NextResponse.json({ done: false }, { status: 200 })
  }

  const { error: insErr } = await supabase
    .from('habit_checkins')
    .insert({ user_id: userId, habit_id: habitId, date: target })
  if (insErr) return err(500, 'No se pudo marcar', insErr.message)
  return NextResponse.json({ done: true }, { status: 200 })
}
