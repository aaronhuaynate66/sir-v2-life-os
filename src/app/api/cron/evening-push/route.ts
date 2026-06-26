// SIR V2 — GET /api/cron/evening-push. Recordatorio SUAVE de la noche: UN solo
// push por usuario con los hábitos DIARIOS que siguen pendientes hoy. Lo dispara
// Vercel Cron (~21:00 Lima = 02:00 UTC). Si no hay pendientes, no se envía nada
// (buildEveningHabitsPush → null). No es una alarma por hábito: es un cierre de
// día gentil. Mismo patrón de auth/admin que morning-push.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser, vapidReady, type PushPayload } from '@/lib/push/send'
import { buildEveningHabitsPush, type EveningHabit } from '@/lib/habits/eveningPush'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurada' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!vapidReady()) return NextResponse.json({ error: 'VAPID no configurado' }, { status: 503 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Faltan envs de Supabase' }, { status: 500 })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  type SendClient = Parameters<typeof sendPushToUser>[0]
  const sendClient = admin as unknown as SendClient

  const { data: subRows, error: subErr } = await admin.from('push_subscriptions').select('user_id').limit(5000)
  if (subErr) return NextResponse.json({ error: 'No se pudieron leer suscripciones', detail: subErr.message }, { status: 500 })
  const userIds = [...new Set((subRows ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))]

  const now = new Date()
  let sent = 0
  const results: Array<{ user: string; sent: number }> = []

  for (const uid of userIds) {
    try {
      const { data: habitRows } = await admin
        .from('habits')
        .select('id, title, cadence')
        .eq('user_id', uid)
        .eq('active', true)
        .limit(50)
      const habitList = (habitRows ?? []) as Array<{ id: string; title: string; cadence: string }>
      if (habitList.length === 0) { results.push({ user: uid.slice(0, 8), sent: 0 }); continue }

      const since = new Date(now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10)
      const { data: ckRows } = await admin
        .from('habit_checkins')
        .select('habit_id, date')
        .eq('user_id', uid)
        .gte('date', since)
        .limit(2000)
      const byHabit = new Map<string, string[]>()
      for (const c of (ckRows ?? []) as Array<{ habit_id: string; date: string }>) {
        const arr = byHabit.get(c.habit_id) ?? []
        arr.push(c.date)
        byHabit.set(c.habit_id, arr)
      }
      const habits: EveningHabit[] = habitList.map((h) => ({
        title: h.title,
        cadence: h.cadence === 'weekly' ? 'weekly' : 'daily',
        checkinDates: byHabit.get(h.id) ?? [],
      }))

      const push = buildEveningHabitsPush(habits, now)
      if (!push) { results.push({ user: uid.slice(0, 8), sent: 0 }); continue }
      const payload: PushPayload = { title: push.title, body: push.body, url: '/habitos', tag: 'evening-habits' }
      const r = await sendPushToUser(sendClient, uid, payload)
      sent += r.sent
      results.push({ user: uid.slice(0, 8), sent: r.sent })
    } catch {
      results.push({ user: uid.slice(0, 8), sent: 0 })
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, sent, results }, { status: 200 })
}
