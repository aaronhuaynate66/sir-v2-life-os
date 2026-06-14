// SIR V2 — GET /api/cron/morning-push (PR3 push notifications)
//
// Push diario de la mañana: UN solo push CALMO por usuario suscrito. Lo dispara
// Vercel Cron (ver vercel.json, ~06:00 Lima = 11:00 UTC). Sin sesión:
//   - Auth via CRON_SECRET (igual que los otros crons).
//   - Cliente service-role para iterar usuarios; filtro por user_id explícito.
//   - Solo usuarios con suscripción push. Contenido determinístico (sin LLM →
//     cero latencia/502). El detalle con IA vive en /panel (donde abre el push).
//
// Filtro rector: no volcar; elegir pocas señales y decirlas corto.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { sendPushToUser, vapidReady, type PushPayload } from '@/lib/push/send'
import { daysUntilNextBirthday } from '@/lib/people/professionalNetwork'
import { buildMorningPush, type MorningBirthday } from '@/lib/push/morning'
import { habitNudge, type NudgeHabit } from '@/lib/habits/nudge'
import { bodySignal } from '@/lib/health/bodySignal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BIRTHDAY_WINDOW_DAYS = 5

/** Fecha "hoy" en Lima (UTC-5) como YYYY-MM-DD. El cron corre ~11:00 UTC. */
function limaToday(now: Date): string {
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurada — el cron no corre sin protección.' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!vapidReady()) {
    return NextResponse.json({ error: 'VAPID no configurado — push deshabilitado.' }, { status: 503 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 })
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  // sendPushToUser tipa el cliente SSR; el admin es estructuralmente compatible
  // para las operaciones que usa (select/delete sobre push_subscriptions).
  type SendClient = Parameters<typeof sendPushToUser>[0]
  const sendClient = admin as unknown as SendClient

  // Usuarios con suscripción push.
  const { data: subRows, error: subErr } = await admin
    .from('push_subscriptions')
    .select('user_id')
    .limit(5000)
  if (subErr) {
    return NextResponse.json({ error: 'No se pudieron leer suscripciones', detail: subErr.message }, { status: 500 })
  }
  const userIds = [...new Set((subRows ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))]

  const now = new Date()
  const today = limaToday(now)
  let sent = 0
  const results: Array<{ user: string; sent: number }> = []

  for (const uid of userIds) {
    try {
      // Gente y fechas: cumpleaños próximos (≤ ventana).
      const { data: peopleRows } = await admin
        .from('people')
        .select('name, birth_date')
        .eq('user_id', uid)
        .not('birth_date', 'is', null)
        .limit(1000)
      const birthdays: MorningBirthday[] = []
      for (const p of (peopleRows ?? []) as Array<{ name: string; birth_date: string | null }>) {
        const d = daysUntilNextBirthday(p.birth_date, now)
        if (d !== null && d <= BIRTHDAY_WINDOW_DAYS) birthdays.push({ name: p.name, days: d })
      }
      birthdays.sort((a, b) => a.days - b.days)

      // Tareas que vencen hoy (no hechas).
      const { data: stepRows } = await admin
        .from('objective_steps')
        .select('title, target_date, status')
        .eq('user_id', uid)
        .eq('target_date', today)
        .neq('status', 'hecho')
        .limit(50)
      const dueTasks = (stepRows ?? []).map((s) => (s as { title: string }).title).filter(Boolean)

      // Foco: ancla del año, o el próximo paso de un objetivo activo.
      const { data: goalRows } = await admin
        .from('goals')
        .select('title, next_action, is_anchor, status')
        .eq('user_id', uid)
        .eq('status', 'active')
        .limit(50)
      const goals = (goalRows ?? []) as Array<{ title: string; next_action: string; is_anchor: boolean | null }>
      const anchor = goals.find((g) => g.is_anchor)
      const withNext = goals.find((g) => g.next_action && g.next_action.trim().length > 0)
      const focus = anchor?.title || (withNext ? withNext.next_action : undefined)

      // Una señal sin resolver (la primera de mayor urgencia).
      const { data: sigRows } = await admin
        .from('signals')
        .select('content, urgency, resolved')
        .eq('user_id', uid)
        .eq('resolved', false)
        .limit(20)
      const sigs = (sigRows ?? []) as Array<{ content: string; urgency: string }>
      const rank: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 }
      sigs.sort((a, b) => (rank[b.urgency] ?? 0) - (rank[a.urgency] ?? 0))
      const topSignal = sigs[0]?.content

      // Hábito a retomar: solo si una racha se cortó (tone 'recover'); a las
      // 6am los pendientes del día son obvios y serían ruido.
      let habitNudgeText: string | undefined
      try {
        const { data: habitRows } = await admin
          .from('habits')
          .select('id, title')
          .eq('user_id', uid)
          .eq('active', true)
          .limit(50)
        const habitList = (habitRows ?? []) as Array<{ id: string; title: string }>
        if (habitList.length > 0) {
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
          const nudgeHabits: NudgeHabit[] = habitList.map((h) => ({
            title: h.title,
            checkinDates: byHabit.get(h.id) ?? [],
          }))
          const n = habitNudge(nudgeHabits, now)
          if (n && n.tone === 'recover') habitNudgeText = n.text
        }
      } catch {
        /* fail-soft */
      }

      // Señal del cuerpo: deuda de sueño desde sleep_records (Apple Health).
      let bodySignalText: string | undefined
      try {
        const since = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
        const { data: sleepRows } = await admin
          .from('sleep_records')
          .select('duration, date')
          .eq('user_id', uid)
          .gte('date', since)
          .limit(30)
        const hrs = (sleepRows ?? [])
          .map((r) => Number((r as { duration: unknown }).duration))
          .filter((n) => Number.isFinite(n))
        const sig = bodySignal({ recentSleepHours: hrs })
        if (sig) bodySignalText = sig
      } catch {
        /* fail-soft */
      }

      const push = buildMorningPush({ birthdays, dueTasks, focus, topSignal, habitNudge: habitNudgeText, bodySignal: bodySignalText })
      const payload: PushPayload = { title: push.title, body: push.body, url: '/panel', tag: 'morning' }
      const r = await sendPushToUser(sendClient, uid, payload)
      sent += r.sent
      results.push({ user: uid.slice(0, 8), sent: r.sent })
    } catch {
      results.push({ user: uid.slice(0, 8), sent: 0 })
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, sent, results }, { status: 200 })
}
