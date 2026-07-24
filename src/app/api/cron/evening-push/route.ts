// SIR V2 — GET /api/cron/evening-push. Recordatorio SUAVE de la noche: UN solo
// push por usuario con los hábitos DIARIOS que siguen pendientes hoy. Lo dispara
// Vercel Cron (~21:00 Lima = 02:00 UTC). Si no hay pendientes, no se envía nada
// (buildEveningHabitsPush → null). No es una alarma por hábito: es un cierre de
// día gentil. Mismo patrón de auth/admin que morning-push.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser, vapidReady, type PushPayload } from '@/lib/push/send'
import { buildEveningHabitsPush, type EveningHabit } from '@/lib/habits/eveningPush'
import { isTelegramConfigured, sendTelegramMessage, sendTelegramKeyboard } from '@/lib/telegram/client'
import { formatEveningBriefForChat } from '@/lib/telegram/eveningBrief'
import { pendingDailyHabits, habitCallbackData } from '@/lib/habits/checkinButtons'
import { buildWhoIsWhoKeyboard } from '@/lib/social-reader/whoIsWho'
import { relacionesUrl } from '@/lib/app-url'
import { limaDayString } from '@/lib/habits/streak'
import { reportApiError } from '@/lib/observability/reportApiError'

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

  // Cierre del día por Telegram (invita a reflexionar/dictar notas). OPT-IN con
  // TELEGRAM_EVENING_BRIEF=1. Al dueño se le manda aunque no tenga Web Push.
  const briefEnabled = process.env.TELEGRAM_EVENING_BRIEF === '1' && isTelegramConfigured()
  const tgOwnerId = process.env.TELEGRAM_OWNER_USER_ID?.trim() || null
  const tgChat = process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim() || null
  if (briefEnabled && tgOwnerId && tgChat && !userIds.includes(tgOwnerId)) userIds.push(tgOwnerId)
  let telegramBriefs = 0

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

      let push: { title: string; body: string } | null = null
      let pendingHabits: { id: string; title: string }[] = []
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
        const habits: EveningHabit[] = habitList.map((h) => ({
          title: h.title,
          cadence: h.cadence === 'weekly' ? 'weekly' : 'daily',
          checkinDates: byHabit.get(h.id) ?? [],
        }))
        push = buildEveningHabitsPush(habits, now)
        // Hábitos diarios que faltan marcar hoy → botones (un toque, sin escribir).
        pendingHabits = pendingDailyHabits(
          habitList.map((h) => ({ id: h.id, title: h.title, cadence: h.cadence, checkinDates: byHabit.get(h.id) ?? [] })),
          limaDayString(now),
        )
      }

      // Web Push: solo si hay pendientes (comportamiento original).
      if (push) {
        const payload: PushPayload = { title: push.title, body: push.body, url: '/habitos', tag: 'evening-habits' }
        const r = await sendPushToUser(sendClient, uid, payload)
        sent += r.sent
      }

      // Telegram: cierre del día al dueño, INDEPENDIENTE de si hay hábitos
      // pendientes (la invitación a reflexionar/dictar vale igual).
      if (briefEnabled && tgOwnerId && tgChat && uid === tgOwnerId) {
        const chatText = formatEveningBriefForChat(push?.body)
        const tg = await sendTelegramMessage(Number(tgChat), chatText)
        if (tg.ok) {
          telegramBriefs++
          try {
            await admin.from('sir_messages').insert({ user_id: uid, role: 'sir', content: chatText.slice(0, 4000), channel: 'telegram' })
          } catch { /* fail-open */ }
        }
        // Check-in de hábitos por BOTONES (Aaron: más UX-friendly que escribir "ya
        // medité"). Un botón por hábito diario pendiente; el tap lo marca (callback
        // "hb|<id>" → webhook). Solo si quedan pendientes.
        if (pendingHabits.length > 0) {
          const rows = pendingHabits.slice(0, 8).map((h) => [{ text: `✅ ${h.title}`, callbackData: habitCallbackData(h.id) }])
          await sendTelegramKeyboard(Number(tgChat), '¿Cuáles de tus hábitos hiciste hoy? Toca los que sí 👇', rows)
        }

        // "¿QUIÉN ES QUIÉN?": handles de IG que el reader vio pero no están
        // asignados a un contacto. SIR pregunta acá (Aaron responde "@handle
        // Nombre" y el webhook lo matchea). Throttle por asked_at → no re-pregunta
        // los mismos. Fail-soft si la tabla 0152/0154 no propagó.
        try {
          const { data: un } = await admin
            .from('unmatched_social_activity')
            .select('id, handle, name')
            .eq('user_id', uid).eq('platform', 'instagram').eq('kind', 'available')
            .is('asked_at', null).not('handle', 'is', null)
            .order('observed_at', { ascending: false }).limit(10)
          const rows = (un ?? []) as Array<{ id: string; handle: string; name: string | null }>
          if (rows.length > 0) {
            // Teclado: [✕ @handle] por cuenta (descartar, seguro) + "abrir en la app"
            // para nombrar viendo la cara. Reemplaza el protocolo de texto confuso.
            const { text, keyboard } = buildWhoIsWhoKeyboard(rows, relacionesUrl())
            const tg = await sendTelegramKeyboard(Number(tgChat), text, keyboard)
            if (tg.ok) await admin.from('unmatched_social_activity').update({ asked_at: new Date().toISOString() }).in('id', rows.map((r) => r.id))
          }
        } catch { /* fail-soft */ }
      }
      results.push({ user: uid.slice(0, 8), sent: push ? 1 : 0 })
    } catch (e) {
      // Antes se tragaba en silencio: un bug lógico rompía el brief nocturno y el
      // push degradaba a vacío sin traza (mismo fix que morning-push). Fail-soft
      // por-usuario, pero AHORA con telemetría.
      reportApiError(e, { route: 'cron/evening-push', user: uid.slice(0, 8) })
      results.push({ user: uid.slice(0, 8), sent: 0 })
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, sent, telegramBriefs, results }, { status: 200 })
}
