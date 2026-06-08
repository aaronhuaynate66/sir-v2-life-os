// SIR V2 — POST /api/habits/checkin (Etapa 3)
// Toggle del checkin de HOY para un hábito: si no existe lo crea, si existe lo
// borra (des-marcar). Idempotente por (user, hábito, día). Auth + RLS.
// Body: { habit_id: string }  Response: { done: boolean }

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  let body: { habit_id?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return err(400, 'Body JSON inválido')
  }
  const habitId = typeof body.habit_id === 'string' ? body.habit_id : ''
  if (!habitId) return err(400, 'habit_id requerido')

  // Ownership del hábito.
  const { data: habit, error: hErr } = await supabase
    .from('habits')
    .select('id')
    .eq('user_id', userId)
    .eq('id', habitId)
    .maybeSingle()
  if (hErr) return err(500, 'No se pudo verificar el hábito', hErr.message)
  if (!habit) return err(404, 'Hábito no encontrado')

  const today = new Date().toISOString().slice(0, 10)

  const { data: existing } = await supabase
    .from('habit_checkins')
    .select('id')
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .eq('date', today)
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
    .insert({ user_id: userId, habit_id: habitId, date: today })
  if (insErr) return err(500, 'No se pudo marcar', insErr.message)
  return NextResponse.json({ done: true }, { status: 200 })
}
