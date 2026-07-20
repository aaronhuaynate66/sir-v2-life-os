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
import { isTelegramConfigured, sendTelegramMessage } from '@/lib/telegram/client'
import { formatMorningBriefForChat } from '@/lib/telegram/morningBrief'
import { daysUntilNextBirthday } from '@/lib/people/professionalNetwork'
import { buildMorningPush, type MorningBirthday } from '@/lib/push/morning'
import { sortSpecialDates, formatCountdownPhrase } from '@/lib/dates/specialDates'
import type { SpecialDate } from '@/types'
import { habitNudge, type NudgeHabit } from '@/lib/habits/nudge'
import { bodySignal } from '@/lib/health/bodySignal'
import { vitalsAnomaly, type DailyVitals } from '@/lib/health/vitalsAnomaly'
import { calibrateRanges, type VitalsHistory } from '@/lib/health/calibrate'
import { healthDataGap } from '@/lib/health/dataGap'
import { parseWeightCategory } from '@/engines/targets'
import { assembleDailyActions } from '@/lib/daily-actions/assemble'
import { labPatterns, labAlertPushLine } from '@/lib/health-exams/patterns'
import { rowToHealthExam } from '@/lib/health-exams/types'
import { rowToContactReminder, topContactReminderText } from '@/lib/contact-reminders/types'
import { rowToContactSignal } from '@/lib/contact-timing/types'
import { assessContactTiming, timingPushLine } from '@/lib/contact-timing/assess'
import { momentResolutionPushLine, type MomentResolutionSuggestion } from '@/lib/moments/resolutionCheck'
import { pickTopSignal } from '@/lib/signals/freshness'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BIRTHDAY_WINDOW_DAYS = 5
/** Ventana para avisar de un aniversario/fecha especial (incluye el mensario).
 *  Corta: un aniversario es puntual, no un evento de agenda semanal. */
const ANNIVERSARY_WINDOW_DAYS = 2

/** Normaliza el jsonb special_dates a SpecialDate[] tolerando filas viejas. */
function toSpecialDates(raw: unknown): SpecialDate[] {
  if (!Array.isArray(raw)) return []
  const out: SpecialDate[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const label = typeof r.label === 'string' ? r.label : ''
    const date = typeof r.date === 'string' ? r.date : ''
    if (!label || !date) continue
    const cadence = r.cadence === 'monthly' || r.cadence === 'yearly' || r.cadence === 'once' ? r.cadence : undefined
    out.push({ id: typeof r.id === 'string' ? r.id : `${date}-${label}`, label, date, recurring: r.recurring === true, ...(cadence ? { cadence } : {}) })
  }
  return out
}

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

  // Brief de la mañana TAMBIÉN por Telegram (canal conversacional proactivo).
  // Opt-in explícito con TELEGRAM_MORNING_BRIEF=1 (comportamiento saliente
  // recurrente → no se activa solo). Al dueño se le manda aunque no tenga
  // suscripción Web Push, así que lo sumamos al set de usuarios a procesar.
  const briefEnabled = process.env.TELEGRAM_MORNING_BRIEF === '1' && isTelegramConfigured()
  const tgOwnerId = process.env.TELEGRAM_OWNER_USER_ID?.trim() || null
  const tgChat = process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim() || null
  if (briefEnabled && tgOwnerId && tgChat && !userIds.includes(tgOwnerId)) userIds.push(tgOwnerId)
  let telegramBriefs = 0

  const now = new Date()
  const today = limaToday(now)
  // Día de la semana en Lima (UTC-5). Los patrones de laboratorio se avisan solo
  // los LUNES: son crónicos (anuales), no agudos → un recordatorio semanal, no ruido diario.
  const isMondayLima = new Date(now.getTime() - 5 * 3_600_000).getUTCDay() === 1
  let sent = 0
  const results: Array<{ user: string; sent: number }> = []

  for (const uid of userIds) {
    try {
      // Gente y fechas: cumpleaños + fechas especiales (aniversarios, mensario).
      const { data: peopleRows } = await admin
        .from('people')
        .select('name, birth_date, special_dates')
        .eq('user_id', uid)
        .limit(1000)
      const people = (peopleRows ?? []) as Array<{ name: string; birth_date: string | null; special_dates: unknown }>
      const birthdays: MorningBirthday[] = []
      for (const p of people) {
        const d = daysUntilNextBirthday(p.birth_date, now)
        if (d !== null && d <= BIRTHDAY_WINDOW_DAYS) birthdays.push({ name: p.name, days: d })
      }
      birthdays.sort((a, b) => a.days - b.days)

      // Fechas especiales próximas (aniversarios anuales + mensario). Reusa el
      // MISMO motor de countdown que la ficha/agenda (cadencia mensual incluida)
      // → dedup + orden ya resueltos. Ventana corta; excluye cumpleaños (ya van
      // arriba) para no duplicar.
      const importantDatesRanked: Array<{ text: string; days: number }> = []
      for (const p of people) {
        const { valid } = sortSpecialDates(toSpecialDates(p.special_dates), now)
        for (const cd of valid) {
          if (cd.isPast || cd.daysUntil > ANNIVERSARY_WINDOW_DAYS) continue
          if (/cumple|natalicio/i.test(cd.sd.label)) continue // el cumple va en birthdays
          importantDatesRanked.push({ text: `${cd.sd.label} · ${formatCountdownPhrase(cd)}`, days: cd.daysUntil })
        }
      }
      importantDatesRanked.sort((a, b) => a.days - b.days)
      const importantDates = importantDatesRanked.slice(0, 3).map((d) => d.text)

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
        .select('title, next_action, is_anchor, status, target_date, target, anchor_subtitle, description')
        .eq('user_id', uid)
        .eq('status', 'active')
        .limit(50)
      const goals = (goalRows ?? []) as Array<{
        title: string; next_action: string; is_anchor: boolean | null;
        target_date: string | null; target: string | null;
        anchor_subtitle: string | null; description: string | null;
      }>
      const anchor = goals.find((g) => g.is_anchor)
      const withNext = goals.find((g) => g.next_action && g.next_action.trim().length > 0)
      const focus = anchor?.title || (withNext ? withNext.next_action : undefined)

      // SEMANA EN FOCO: goal con target_date ≤7d → texto listo para el push.
      let weekFocusText: string | undefined
      const todayMs = new Date(today + 'T00:00:00Z').getTime()
      for (const g of goals) {
        if (!g.target_date) continue
        const targetMs = new Date(g.target_date + 'T00:00:00Z').getTime()
        const days = Math.round((targetMs - todayMs) / 86_400_000)
        if (days < 0 || days > 7) continue
        const when = days === 0 ? 'HOY' : days === 1 ? 'MAÑANA' : `EN ${days} DÍAS`
        weekFocusText = `${g.title} · ${when}`
        break
      }

      // ALERTA DE PESO MUNDIAL: si hay goal con "mundial/taekwondo/wfg" +
      // categoría en el target, y la última lectura de peso está fuera.
      let metricAlertText: string | undefined
      try {
        const mundialGoal = goals.find((g) =>
          /mundial|taekwondo|wfg/i.test(g.title + ' ' + (g.description ?? ''))
        )
        if (mundialGoal) {
          const range = parseWeightCategory(mundialGoal.target ?? undefined)
            ?? parseWeightCategory(mundialGoal.anchor_subtitle ?? undefined)
            ?? parseWeightCategory(mundialGoal.description ?? undefined)
          if (range) {
            const { data: weightRows } = await admin
              .from('health_metrics')
              .select('value, measured_at')
              .eq('user_id', uid)
              .eq('type', 'weight')
              .order('measured_at', { ascending: false })
              .limit(1)
            const w = (weightRows ?? [])[0] as { value: number } | undefined
            if (w && Number.isFinite(w.value)) {
              const kg = w.value
              const CLOSE = 1
              if (kg < range.min) metricAlertText = `Peso ${kg} kg — fuera de categoría`
              else if (kg > range.max) metricAlertText = `Peso ${kg} kg — sobre la categoría`
              else if (kg - range.min < CLOSE) metricAlertText = `Peso ${kg} kg — cerca del piso ${range.min} kg`
              else if (range.max - kg < CLOSE) metricAlertText = `Peso ${kg} kg — cerca del techo ${range.max} kg`
            }
          }
        }
      } catch {
        /* fail-soft */
      }

      // ANOMALÍA DE SIGNOS VITALES: si varias señales (VFC / FC en sueño /
      // respiración / alertas de FC) se desvían adversamente EL MISMO día, el
      // cuerpo está bajo carga (incubando algo, fiebre, estrés). Tiene prioridad
      // sobre el aviso de peso: una señal de salud aguda importa más.
      let vitalsAlerted = false
      try {
        // Ventana de 30 días: sirve tanto para detectar el día de hoy como para
        // AUTO-CALIBRAR los umbrales contra el baseline personal de Aaron.
        const since = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
        const { data: vitalRows } = await admin
          .from('health_metrics')
          .select('type, value, measured_at')
          .eq('user_id', uid)
          .in('type', ['hrv_avg', 'sleeping_heart_rate', 'respiratory_rate', 'heart_rate_high_alerts'])
          .gte('measured_at', since)
          .limit(500)
        const byDate = new Map<string, DailyVitals>()
        const hist: VitalsHistory = { hrvAvg: [], sleepingHr: [], respRate: [], highHrAlerts: [] }
        for (const r of (vitalRows ?? []) as Array<{ type: string; value: number; measured_at: string }>) {
          const iso = (r.measured_at ?? '').slice(0, 10)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue
          const v = Number(r.value)
          if (!Number.isFinite(v)) continue
          const d = byDate.get(iso) ?? { date: iso }
          if (r.type === 'hrv_avg') { d.hrvAvg = v; hist.hrvAvg.push(v) }
          else if (r.type === 'sleeping_heart_rate') { d.sleepingHr = v; hist.sleepingHr.push(v) }
          else if (r.type === 'respiratory_rate') { d.respRate = v; hist.respRate.push(v) }
          else if (r.type === 'heart_rate_high_alerts') { d.highHrAlerts = v; hist.highHrAlerts.push(v) }
          byDate.set(iso, d)
        }
        // Umbrales personales (percentiles de su propia historia); con poca data
        // caen a los defaults del rango Zepp.
        const { ranges } = calibrateRanges(hist)
        const anomaly = vitalsAnomaly([...byDate.values()], ranges)
        if (anomaly) { metricAlertText = anomaly.text; vitalsAlerted = true }
      } catch {
        /* fail-soft */
      }

      // AVISO DE DATA FALTANTE: si NO hubo anomalía fresca y hace ≥3 días que no
      // se carga salud, recordarlo (sin data SIR queda ciego). La salud entra por
      // carga manual de capturas. Prioridad: anomalía > gap > peso.
      if (!vitalsAlerted) {
        try {
          const [{ data: hmLast }, { data: slLast }] = await Promise.all([
            admin.from('health_metrics').select('measured_at').eq('user_id', uid).order('measured_at', { ascending: false }).limit(1),
            admin.from('sleep_records').select('date').eq('user_id', uid).order('date', { ascending: false }).limit(1),
          ])
          const last = [
            ((hmLast ?? [])[0] as { measured_at?: string } | undefined)?.measured_at?.slice(0, 10),
            ((slLast ?? [])[0] as { date?: string } | undefined)?.date?.slice(0, 10),
          ].filter((s): s is string => !!s).sort().at(-1) ?? null
          const gap = healthDataGap(last, now.toISOString().slice(0, 10))
          if (gap) metricAlertText = gap
        } catch {
          /* fail-soft */
        }
      }

      // Una señal sin resolver (la primera de mayor urgencia).
      const { data: sigRows } = await admin
        .from('signals')
        .select('content, urgency, resolved, created_at')
        .eq('user_id', uid)
        .eq('resolved', false)
        .limit(20)
      // pickTopSignal descarta las señales RANCIAS (no-críticas de >21d): una
      // señal abierta hace semanas que la data ya desmiente no es "atención de
      // hoy" (bug FC 1-jun). Las críticas persisten hasta resolverse.
      const topSignal = pickTopSignal(
        (sigRows ?? []).map((s) => ({ content: (s as { content: string }).content, urgency: (s as { urgency: string }).urgency, createdAt: (s as { created_at?: string }).created_at ?? null })),
        now.getTime(),
      ) ?? undefined

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

      // VIGILANCIA DE LABORATORIO (semanal, lunes): un patrón de chequeos
      // consistente que YA se salió de rango no debe quedar "al baúl" (idea de
      // Aaron). Solo los lunes → recordatorio periódico, no alarma diaria. Es la
      // capa crónica de salud, aparte de la aguda (anomalía de vitales de arriba).
      let healthWatchText: string | undefined
      if (isMondayLima) {
        try {
          const { data: examRows } = await admin
            .from('health_exams')
            .select('id, exam_date, provider, title, summary, findings, values, recommendations, storage_path')
            .eq('user_id', uid)
            .order('exam_date', { ascending: true })
            .limit(50)
          const exams = (examRows ?? []).map((r) => ({ ...rowToHealthExam(r as Record<string, unknown>), pdfUrl: null }))
          if (exams.length >= 2) {
            const line = labAlertPushLine(labPatterns(exams))
            if (line) healthWatchText = line
          }
        } catch {
          /* fail-soft: la tabla puede no haber propagado aún */
        }
      }

      // A QUIÉN CUIDAR HOY: el vínculo más urgente de "Reconectar", con el MISMO
      // motor que la app (assembleDailyActions). SIR sabe a quién estás
      // descuidando; esto lo saca de la app y te lo dice en el push/Telegram.
      let relationshipNudgeText: string | undefined
      try {
        const { actions } = await assembleDailyActions(admin as unknown as SupabaseClient, uid, now, { focus: 'reconnect', limit: 1 })
        const top = actions[0]
        if (top && (top.urgency === 'high' || top.urgency === 'medium')) {
          const who = top.kinLabel ? `${top.personName} (${top.kinLabel})` : top.personName
          relationshipNudgeText = `${who} — ${top.headline}`
          // Si hay un recordatorio "antes de contactar" para ESTA persona, este es
          // EL momento de surgirlo: el push ya te empuja a escribirle. Es el punto
          // de los contact_reminders (#801) — que aparezcan, no que se olviden. Fail-soft.
          try {
            const { data: crRows } = await admin
              .from('contact_reminders')
              .select('id, person_id, text, kind, status, created_at, done_at')
              .eq('user_id', uid)
              .eq('person_id', top.personId)
              .eq('status', 'pending')
              .limit(20)
            const rt = topContactReminderText((crRows ?? []).map((r) => rowToContactReminder(r as Record<string, unknown>)))
            if (rt) relationshipNudgeText += ` · antes de escribirle: ${rt}`
          } catch { /* tabla 0148 sin propagar → sin recordatorio */ }
          // TIMING (Parte B): si SIR sabe que ESTE no es buen momento (de viaje,
          // a full…), lo avisa acá — para que Aaron no se estampe pidiendo algo
          // en mal momento (caso Dayana). Fail-soft si la tabla 0150 no propagó.
          try {
            const { data: caRows } = await admin
              .from('contact_activity')
              .select('id, person_id, kind, detail, source, observed_at, expires_at')
              .eq('user_id', uid)
              .eq('person_id', top.personId)
              .order('observed_at', { ascending: false })
              .limit(50)
            const verdict = assessContactTiming((caRows ?? []).map((r) => rowToContactSignal(r as Record<string, unknown>)), now.getTime())
            const line = timingPushLine(verdict)
            if (line) relationshipNudgeText += ` · ⏳ ${line}`
          } catch { /* tabla 0150 sin propagar → sin aviso de timing */ }
        }
      } catch {
        /* fail-soft: el nudge relacional es un extra, no rompe el push */
      }

      // CERRAR UN LAZO: un tema abierto (relationship_moment) que el chat ya
      // resolvió. El cron `moment-scan` (LLM, antes de este) lo precomputa y deja
      // la sugerencia en la fila → acá solo LEEMOS (determinístico, sin LLM). Es
      // la fricción "SIR no cruza bien la info" hecha proactiva. Fail-soft si la
      // columna 0151 no propagó.
      let momentResolutionText: string | undefined
      try {
        const { data: mrRows } = await admin
          .from('relationship_moments')
          .select('person_id, title, resolution_confidence')
          .eq('user_id', uid).eq('status', 'abierto').eq('resolution_suggested', true)
          .order('resolution_checked_at', { ascending: false })
          .limit(10)
        const rows = (mrRows ?? []) as Array<{ person_id: string; title: string; resolution_confidence: string | null }>
        if (rows.length > 0) {
          const ids = [...new Set(rows.map((r) => r.person_id).filter(Boolean))]
          const { data: nameRows } = await admin
            .from('people').select('id, name').eq('user_id', uid).in('id', ids)
          const nameById = new Map((nameRows ?? []).map((r) => [(r as { id: string }).id, (r as { name: string }).name]))
          const suggestions: MomentResolutionSuggestion[] = rows.map((r) => ({
            personName: nameById.get(r.person_id) || '',
            title: r.title,
            confidence: r.resolution_confidence === 'high' || r.resolution_confidence === 'medium' ? r.resolution_confidence : 'low',
          }))
          const line = momentResolutionPushLine(suggestions)
          if (line) momentResolutionText = line
        }
      } catch { /* columna 0151 sin propagar → sin sugerencia */ }

      const push = buildMorningPush({ birthdays, importantDates, relationshipNudge: relationshipNudgeText, momentResolution: momentResolutionText, dueTasks, focus, topSignal, habitNudge: habitNudgeText, bodySignal: bodySignalText, weekFocus: weekFocusText, metricAlert: metricAlertText, healthWatch: healthWatchText })
      const payload: PushPayload = { title: push.title, body: push.body, url: '/panel', tag: 'morning' }
      const r = await sendPushToUser(sendClient, uid, payload)
      sent += r.sent
      results.push({ user: uid.slice(0, 8), sent: r.sent })

      // Mismo brief, por Telegram, al dueño (proactivo). El contenido es el
      // mismo determinístico; lo persistimos al hilo unificado para que aparezca
      // también en /sir (web). Fail-open: un fallo no rompe el cron.
      if (briefEnabled && tgOwnerId && tgChat && uid === tgOwnerId) {
        const chatText = formatMorningBriefForChat(push)
        const tg = await sendTelegramMessage(Number(tgChat), chatText)
        if (tg.ok) {
          telegramBriefs++
          try {
            await admin.from('sir_messages').insert({ user_id: uid, role: 'sir', content: chatText.slice(0, 4000), channel: 'telegram' })
          } catch { /* fail-open: el hilo es un extra */ }
        }
      }
    } catch {
      results.push({ user: uid.slice(0, 8), sent: 0 })
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, sent, telegramBriefs, results }, { status: 200 })
}
