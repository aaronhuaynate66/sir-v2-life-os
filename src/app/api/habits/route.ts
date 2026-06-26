// SIR V2 — /api/habits (Etapa 3)
//   GET  → hábitos activos del usuario, cada uno con sus checkin dates (últimos
//          ~35 días) para que el cliente compute racha/consistencia.
//   POST → crea un hábito { title, cadence?, target_per_period? }.
// Auth + RLS. user_id lo pone el server (nunca el cliente).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

interface HabitRow {
  id: string
  title: string
  cadence: string
  target_per_period: number
}
interface CheckinRow {
  habit_id: string
  date: string
  created_at: string
}

export interface HabitDTO {
  id: string
  title: string
  cadence: 'daily' | 'weekly'
  targetPerPeriod: number
  checkinDates: string[]
  /** date 'YYYY-MM-DD' → ISO created_at del check (para mostrar la hora). */
  checkinTimes: Record<string, string>
}

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const userId = auth.user.id

  const { data: habitsData, error: hErr } = await supabase
    .from('habits')
    .select('id, title, cadence, target_per_period')
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at', { ascending: true })
  if (hErr) return err(500, 'No se pudo leer hábitos', hErr.message)
  const habits = (habitsData ?? []) as unknown as HabitRow[]
  if (habits.length === 0) return NextResponse.json({ habits: [] as HabitDTO[] }, { status: 200 })

  const since = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10)
  const { data: ckData } = await supabase
    .from('habit_checkins')
    .select('habit_id, date, created_at')
    .eq('user_id', userId)
    .gte('date', since)
  const byHabit = new Map<string, string[]>()
  const timesByHabit = new Map<string, Record<string, string>>()
  for (const c of (ckData ?? []) as unknown as CheckinRow[]) {
    const arr = byHabit.get(c.habit_id) ?? []
    arr.push(c.date)
    byHabit.set(c.habit_id, arr)
    const tm = timesByHabit.get(c.habit_id) ?? {}
    if (c.created_at) tm[c.date.slice(0, 10)] = c.created_at
    timesByHabit.set(c.habit_id, tm)
  }

  const dto: HabitDTO[] = habits.map((h) => ({
    id: h.id,
    title: h.title,
    cadence: h.cadence === 'weekly' ? 'weekly' : 'daily',
    targetPerPeriod: h.target_per_period,
    checkinDates: byHabit.get(h.id) ?? [],
    checkinTimes: timesByHabit.get(h.id) ?? {},
  }))
  return NextResponse.json({ habits: dto }, { status: 200 })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const userId = auth.user.id

  let body: { title?: unknown; cadence?: unknown; target_per_period?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return err(400, 'Body JSON inválido')
  }
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return err(400, 'title requerido')
  const cadence = body.cadence === 'weekly' ? 'weekly' : 'daily'
  let target = 1
  if (typeof body.target_per_period === 'number' && Number.isFinite(body.target_per_period)) {
    target = Math.max(1, Math.min(7, Math.floor(body.target_per_period)))
  }

  const { data, error } = await supabase
    .from('habits')
    .insert({ user_id: userId, title, cadence, target_per_period: target })
    .select('id, title, cadence, target_per_period')
    .single()
  if (error) return err(500, 'No se pudo crear el hábito', error.message)
  const h = data as unknown as HabitRow
  const dto: HabitDTO = {
    id: h.id,
    title: h.title,
    cadence: h.cadence === 'weekly' ? 'weekly' : 'daily',
    targetPerPeriod: h.target_per_period,
    checkinDates: [],
    checkinTimes: {},
  }
  return NextResponse.json({ habit: dto }, { status: 200 })
}
