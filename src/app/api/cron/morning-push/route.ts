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

import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { sendPushToUser, vapidReady, type PushPayload } from '@/lib/push/send'
import { isTelegramConfigured, sendTelegramMessage, sendTelegramKeyboard } from '@/lib/telegram/client'
import { formatMorningBriefForChat } from '@/lib/telegram/morningBrief'
import { buildBriefThread, muteRef } from '@/lib/telegram/briefThread'
import { applyAutoSnooze, previousDay, type BriefSignalHistory } from '@/lib/brief/autoSnooze'
import { assessCapacity, explainCapacity, applyEnergyGate } from '@/lib/brief/energyGate'
import { weeklyAdherence, adherenceLine, weekStartOf, type TrainingKind } from '@/lib/entrenamiento/adherencia'
import { getSelfBioState } from '@/lib/people/selfState'
import { daysUntilNextBirthday } from '@/lib/people/professionalNetwork'
import { buildMorningPush, topicKey, type MorningBirthday, type MorningEntities } from '@/lib/push/morning'
import { buildCycleWeekAhead, buildCycleWeekAheadLine, type WomanCycleInput } from '@/lib/ciclo/weekAhead'
import { crossAgendaWithCycles, renderCycleAgendaLine } from '@/lib/ciclo/agendaCross'
import { goalNudgeLine } from '@/lib/push/goalNudge'
import { buildGoalTimingNudge } from '@/lib/goals/timingNudge'
import { contactWasFollowed, contactSuggestionSeed } from '@/lib/suggestions/outcome'
import { sortSpecialDates, formatCountdownPhrase } from '@/lib/dates/specialDates'
import type { SpecialDate } from '@/types'
import { habitNudge, type NudgeHabit } from '@/lib/habits/nudge'
import { bodySignal } from '@/lib/health/bodySignal'
import { vitalsAnomaly, type DailyVitals } from '@/lib/health/vitalsAnomaly'
import { calibrateRanges, type VitalsHistory } from '@/lib/health/calibrate'
import { healthDataGap } from '@/lib/health/dataGap'
import { parseWeightCategory } from '@/engines/targets'
import { assessWeightTrend, renderWeightTrendLine } from '@/lib/targets/weightTrend'
import { assembleDailyActions } from '@/lib/daily-actions/assemble'
import { labPatterns, labAlertPushLine } from '@/lib/health-exams/patterns'
import { rowToHealthExam } from '@/lib/health-exams/types'
import { rowToContactReminder, topContactReminderText } from '@/lib/contact-reminders/types'
import { rowToContactSignal } from '@/lib/contact-timing/types'
import { assessContactTiming, timingPushLine } from '@/lib/contact-timing/assess'
import { momentResolutionPushLine, type MomentResolutionSuggestion } from '@/lib/moments/resolutionCheck'
import { pickTopSignal } from '@/lib/signals/freshness'
import { reportApiError } from '@/lib/observability/reportApiError'
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
  /** Señales que el auto-snooze calló hoy (observabilidad del cron). */
  let autoSnoozed = 0
  /** Señales pospuestas por el gate de energía (cuerpo bajo). */
  let energyDeferred = 0

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
        .select('id, title, target_date, status')
        .eq('user_id', uid)
        .eq('target_date', today)
        .neq('status', 'hecho')
        .limit(50)
      const dueStepRows = (stepRows ?? []) as Array<{ id: string; title: string }>
      const dueTasks = dueStepRows.map((s) => s.title).filter(Boolean)
      // Ids de las entidades detrás de las señales → habilitan los botones del
      // hilo de Telegram ("✅ Ya lo hice" necesita saber QUÉ tarea marcar). Con
      // más de una tarea el botón sería ambiguo, así que solo va con exactamente una.
      const briefEntities: MorningEntities = {}
      if (dueStepRows.length === 1) briefEntities.dueTask = { id: dueStepRows[0].id, name: dueStepRows[0].title }

      // Foco: ancla del año, o el próximo paso de un objetivo activo.
      const { data: goalRows } = await admin
        .from('goals')
        .select('id, title, next_action, is_anchor, status, target_date, target, anchor_subtitle, description, progress, updated_at, related_persons')
        .eq('user_id', uid)
        .eq('status', 'active')
        .limit(50)
      const goals = (goalRows ?? []) as Array<{
        id: string; title: string; next_action: string; is_anchor: boolean | null;
        target_date: string | null; target: string | null;
        anchor_subtitle: string | null; description: string | null;
        progress: number | null; updated_at: string | null;
        related_persons: string[] | null;
      }>
      const anchor = goals.find((g) => g.is_anchor)
      const withNext = goals.find((g) => g.next_action && g.next_action.trim().length > 0)
      const focus = anchor?.title || (withNext ? withNext.next_action : undefined)

      // NUDGE DE OBJETIVO: norte estancado o meta en riesgo. SIR ya lo computa
      // (norteDrift / goal engine) pero vivía en un panel; acá lo saca al push.
      const goalNudgeText = goalNudgeLine(
        goals.map((g) => ({
          title: g.title,
          isAnchor: g.is_anchor === true,
          progress: typeof g.progress === 'number' ? g.progress : 0,
          targetDate: g.target_date,
          updatedAt: g.updated_at ?? new Date(0).toISOString(),
        })),
        now,
      ) ?? undefined
      // El nudge nombra el objetivo en su texto → así sabemos cuál es para el
      // botón "🚀 Dame el próximo paso".
      if (goalNudgeText) {
        const hit = goals.find((g) => g.title && goalNudgeText!.includes(g.title))
        if (hit) briefEntities.goalNudgeGoal = { id: hit.id, name: hit.title }
      }

      // BUEN MOMENTO × OBJETIVO (el loop original del reader, caso Dayana/Marlab):
      // una persona ligada a un objetivo activo CON acción pendiente que HOY
      // muestra buen timing (historia activa) → SIR avisa para aprovechar la
      // ventana. Cruza goal.related_persons × contact_activity (kind=available).
      let goalTimingText: string | undefined
      try {
        const goalByPerson = new Map<string, { goalTitle: string; pendingAction: string }>()
        for (const g of goals) {
          const action = (g.next_action ?? '').trim()
          if (!action) continue
          for (const pid of g.related_persons ?? []) {
            if (typeof pid === 'string' && pid && !goalByPerson.has(pid)) {
              goalByPerson.set(pid, { goalTitle: g.title, pendingAction: action })
            }
          }
        }
        if (goalByPerson.size > 0) {
          const sinceIso = new Date(now.getTime() - 36 * 3_600_000).toISOString()
          const { data: sig } = await admin
            .from('contact_activity')
            .select('person_id, observed_at')
            .eq('user_id', uid).eq('kind', 'available').gte('observed_at', sinceIso)
            .in('person_id', Array.from(goalByPerson.keys()))
            .order('observed_at', { ascending: false }).limit(20)
          const rows = (sig ?? []) as Array<{ person_id: string; observed_at: string }>
          if (rows.length > 0) {
            const pids = Array.from(new Set(rows.map((r) => r.person_id)))
            const { data: pplRows } = await admin.from('people').select('id, name').eq('user_id', uid).in('id', pids)
            const nameById = new Map((pplRows ?? []).map((p) => [p.id as string, p.name as string]))
            const cands = rows.flatMap((r) => {
              const g = goalByPerson.get(r.person_id)
              const name = nameById.get(r.person_id)
              return g && name
                ? [{ personName: name, goalTitle: g.goalTitle, pendingAction: g.pendingAction, signalDetail: 'anda activa hoy', observedAt: r.observed_at }]
                : []
            })
            goalTimingText = buildGoalTimingNudge(cands) ?? undefined
          }
        }
      } catch { /* fail-soft: el brief va sin este nudge */ }

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
        if (g.id) briefEntities.weekFocusGoal = { id: g.id, name: g.title }
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
            // La SERIE, no solo la última lectura: el aviso estático no ve venir
            // el problema. Aaron estaba "dentro de rango" con 81.4 kg mientras la
            // tendencia lo llevaba al piso de su categoría antes del Mundial.
            const { data: weightRows } = await admin
              .from('health_metrics')
              .select('value, measured_at')
              .eq('user_id', uid)
              .eq('type', 'weight')
              .order('measured_at', { ascending: false })
              .limit(60)
            const serie = ((weightRows ?? []) as Array<{ value: number; measured_at: string }>)
              .filter((r) => Number.isFinite(Number(r.value)))
              .map((r) => ({ at: r.measured_at, kg: Number(r.value) }))
            const kg = serie[0]?.kg
            if (Number.isFinite(kg)) {
              const cat = { minKg: range.min, maxKg: range.max }
              const daysToEvent = mundialGoal.target_date
                ? Math.round((Date.parse(`${mundialGoal.target_date}T12:00:00Z`) - now.getTime()) / 86_400_000)
                : null
              const trend = assessWeightTrend(serie, cat, now, daysToEvent)
              // La tendencia manda cuando hay riesgo; si no, el estado de hoy.
              metricAlertText = renderWeightTrendLine(trend, cat, kg) ?? undefined
              if (!metricAlertText) {
                const CLOSE = 1
                if (kg < range.min) metricAlertText = `Peso ${kg} kg — fuera de categoría (piso ${range.min} kg)`
                else if (range.max !== null && kg > range.max) metricAlertText = `Peso ${kg} kg — sobre la categoría`
                else if (kg - range.min < CLOSE) metricAlertText = `Peso ${kg} kg — cerca del piso ${range.min} kg`
                else if (range.max !== null && range.max - kg < CLOSE) metricAlertText = `Peso ${kg} kg — cerca del techo ${range.max} kg`
              }
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
          // El `headline` YA nombra a la persona ("Hace 3 semanas sin hablar con
          // X"). Antes prefijábamos `${nombre} — ${headline}` → el nombre salía
          // DOS veces. Ahora usamos el headline (nombre una vez) y adjuntamos el
          // parentesco como nota al final, que sí aporta ("— tu media hermana").
          relationshipNudgeText = top.kinLabel ? `${top.headline} — ${top.kinLabel}` : top.headline
          briefEntities.relationshipPerson = { id: top.personId, name: top.personName }
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
          // P3 (cerebro): registrar la sugerencia de contacto de HOY en el ledger
          // → luego se cierra sola si Aaron efectivamente le escribe. 1/persona/día.
          try {
            const sid = `sug_${createHash('sha1').update(contactSuggestionSeed(uid, top.personId, today)).digest('hex').slice(0, 24)}`
            await admin.from('suggestions').upsert({
              id: sid, user_id: uid, surface: 'momentos', kind: 'contact',
              title: `Escríbele a ${top.personName}`, payload: { personId: top.personId, personName: top.personName },
              status: 'pending',
            }, { onConflict: 'id', ignoreDuplicates: true })
          } catch { /* fail-soft: tabla 0153 sin propagar */ }
        }
      } catch {
        /* fail-soft: el nudge relacional es un extra, no rompe el push */
      }

      // P3 (cerebro) — CIERRE AUTOMÁTICO del loop: las sugerencias de contacto
      // pendientes que YA se cumplieron (Aaron registró una interacción o le
      // escribió por WhatsApp después de la sugerencia) → 'worked'/'done', sin que
      // confirme nada. El import de WhatsApp se vuelve señal de outcome. Fail-soft.
      try {
        const { data: pend } = await admin
          .from('suggestions')
          .select('id, payload, created_at')
          .eq('user_id', uid).eq('kind', 'contact').eq('status', 'pending')
          .limit(50)
        for (const s of (pend ?? []) as Array<{ id: string; payload: { personId?: string } | null; created_at: string }>) {
          const pid = s.payload?.personId
          if (!pid) continue
          const [{ data: logs }, { data: msgs }] = await Promise.all([
            admin.from('person_logs').select('logged_at').eq('user_id', uid).eq('person_id', pid).eq('kind', 'interaction').gte('logged_at', s.created_at).limit(1),
            admin.from('chat_messages').select('sent_at').eq('user_id', uid).eq('person_id', pid).eq('sender', 'user').gte('sent_at', s.created_at).limit(1),
          ])
          const times = [
            ...((logs ?? []) as Array<{ logged_at?: string }>).map((r) => r.logged_at),
            ...((msgs ?? []) as Array<{ sent_at?: string }>).map((r) => r.sent_at),
          ]
          if (contactWasFollowed(s.created_at, times)) {
            await admin.from('suggestions').update({ status: 'done', outcome: 'worked', resolved_at: new Date().toISOString() }).eq('id', s.id)
          }
        }
      } catch { /* fail-soft: tabla 0153 sin propagar */ }

      // CERRAR UN LAZO: un tema abierto (relationship_moment) que el chat ya
      // resolvió. El cron `moment-scan` (LLM, antes de este) lo precomputa y deja
      // la sugerencia en la fila → acá solo LEEMOS (determinístico, sin LLM). Es
      // la fricción "SIR no cruza bien la info" hecha proactiva. Fail-soft si la
      // columna 0151 no propagó.
      let momentResolutionText: string | undefined
      try {
        const { data: mrRows } = await admin
          .from('relationship_moments')
          .select('id, person_id, title, resolution_confidence')
          .eq('user_id', uid).eq('status', 'abierto').eq('resolution_suggested', true)
          .order('resolution_checked_at', { ascending: false })
          .limit(10)
        const rows = (mrRows ?? []) as Array<{ id: string; person_id: string; title: string; resolution_confidence: string | null }>
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
          if (line) {
            momentResolutionText = line
            // El botón "✅ Dar por cerrado" cierra ESTE momento (el primero, que
            // es el que la línea nombra).
            briefEntities.moment = { id: rows[0].id, name: rows[0].title }
          }
        }
      } catch { /* columna 0151 sin propagar → sin sugerencia */ }

      // SEMANA CON CARGA AFECTIVA (anticipación de cuidado): proyecta las ventanas
      // sensibles del ciclo (premenstrual/menstrual) de las mujeres del círculo con
      // ciclo cargado y/o anclas, y avisa si intersecan la semana (marca sincronía).
      // Tono de CUIDADO, marca estimación — NUNCA descalifica ni "gestiona" (doc 17).
      // Fail-soft: un fallo (o tabla sin propagar) no rompe el brief.
      let cycleWeekAheadText: string | undefined
      /** Un plan agendado que cae dentro de la ventana sensible de esa persona. */
      let cycleAgendaText: string | undefined
      try {
        const { data: womenRows } = await admin
          .from('people')
          .select('id, name, gender, cycle_start_date, cycle_length_days')
          .eq('user_id', uid)
          .or('gender.eq.female,cycle_start_date.not.is.null')
          .limit(500)
        const womenPeople = (womenRows ?? []) as Array<{
          id: string; name: string; gender: string | null
          cycle_start_date: string | null; cycle_length_days: number | null
        }>
        if (womenPeople.length > 0) {
          const wIds = womenPeople.map((p) => p.id)
          const cyclesByPerson = new Map<string, Array<{ date: string; phase: string }>>()
          try {
            const since = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10)
            const { data: cyc } = await admin
              .from('person_cycles')
              .select('person_id, date, phase')
              .eq('user_id', uid)
              .in('person_id', wIds)
              .gte('date', since)
              .limit(1000)
            for (const c of (cyc ?? []) as Array<{ person_id: string; date: string; phase: string }>) {
              const arr = cyclesByPerson.get(c.person_id) ?? []
              arr.push({ date: c.date, phase: c.phase })
              cyclesByPerson.set(c.person_id, arr)
            }
          } catch { /* sin anclas → proyección solo por calendario */ }
          const womenInput: WomanCycleInput[] = womenPeople
            .map((p) => ({
              personId: p.id, name: p.name,
              cycleStartDate: p.cycle_start_date ? p.cycle_start_date.slice(0, 10) : null,
              cycleLengthDays: p.cycle_length_days ?? null,
              anchors: cyclesByPerson.get(p.id) ?? [],
            }))
            .filter((w) => w.cycleStartDate || (w.anchors && w.anchors.length > 0))
          const weekAhead = buildCycleWeekAhead(womenInput, now, 7)
          cycleWeekAheadText = buildCycleWeekAheadLine(weekAhead) ?? undefined

          // CRUCE VENTANA × AGENDA (docs/CABLEADO.md #3): SIR sabía quién está en
          // ventana sensible y sabía qué hay agendado, pero nadie miraba si LA
          // REUNIÓN CON ELLA cae justo ahí. Es timing y cuidado —"date margen",
          // nunca "aprovecha"— sobre planes que YA existen. Fail-soft.
          try {
            const { data: evRows } = await admin
              .from('personal_events')
              .select('title, event_date, person_id')
              .eq('user_id', uid)
              .gte('event_date', weekAhead.from)
              .lte('event_date', weekAhead.to)
              .not('person_id', 'is', null)
              .limit(100)
            const eventos = ((evRows ?? []) as Array<{ title: string; event_date: string; person_id: string }>)
              .map((e) => ({ date: (e.event_date ?? '').slice(0, 10), title: e.title, personId: e.person_id }))
            const hits = crossAgendaWithCycles(eventos, weekAhead.women, { from: weekAhead.from, to: weekAhead.to })
            cycleAgendaText = renderCycleAgendaLine(hits, today) ?? undefined
          } catch { /* sin agenda → solo la línea general de la semana */ }
        }
      } catch {
        /* fail-soft: la anticipación de cuidado es un extra, no rompe el push */
      }

      // ADHERENCIA AL PLAN DE ENTRENAMIENTO: el plan del Mundial pide 4 sesiones
      // por semana, 3 de ellas de FUERZA (es donde gana el músculo que necesita
      // para no caerse de categoría). Sin esto, el plan es una intención.
      // Fail-soft: sin la tabla 0169 o sin sesiones, no hay línea.
      let trainingAdherenceText: string | undefined
      try {
        const monday = weekStartOf(today)
        const { data: tsRows } = await admin
          .from('training_sessions').select('date, kind, duration_min')
          .eq('user_id', uid).gte('date', monday).lte('date', today).limit(30)
        const sessions = ((tsRows ?? []) as Array<{ date: string; kind: string; duration_min: number | null }>)
          .map((r) => ({ date: r.date, kind: r.kind as TrainingKind, durationMin: r.duration_min }))
        // Solo tiene sentido si hay un plan al que adherir (goal del Mundial).
        const hayPlan = goals.some((g) => /mundial|taekwondo|wfg/i.test(`${g.title} ${g.description ?? ''}`))
        if (hayPlan) {
          const a = weeklyAdherence(sessions, { total: 4, ofKind: { kind: 'fuerza', count: 3 } }, today)
          trainingAdherenceText = adherenceLine(a) ?? undefined
        }
      } catch { /* tabla 0169 sin propagar → sin línea */ }

      // SILENCIADOS (🔕): temas que Aaron mandó a callar. Se filtran dentro de
      // buildMorningPush, antes del cap, así no le roban el cupo a otra señal.
      // Fail-soft: sin la tabla (0166 sin propagar) el brief va completo.
      let mutedTopics: string[] = []
      try {
        const { data: muteRows } = await admin
          .from('brief_mutes').select('topic_key').eq('user_id', uid).limit(200)
        mutedTopics = (muteRows ?? []).map((r) => (r as { topic_key: string }).topic_key).filter(Boolean)
      } catch { /* tabla 0166 sin propagar */ }

      const briefInput = { birthdays, importantDates, relationshipNudge: relationshipNudgeText, momentResolution: momentResolutionText, cycleWeekAhead: cycleWeekAheadText, cycleAgenda: cycleAgendaText, goalContactTiming: goalTimingText, dueTasks, focus, goalNudge: goalNudgeText, trainingAdherence: trainingAdherenceText, topSignal, habitNudge: habitNudgeText, bodySignal: bodySignalText, weekFocus: weekFocusText, metricAlert: metricAlertText, healthWatch: healthWatchText, entities: briefEntities }
      let push = buildMorningPush({ ...briefInput, mutedTopics })

      // AUTO-SNOOZE: lo que ya se dijo 3 mañanas seguidas sin cambiar se calla
      // solo (y vuelve en 2 semanas). Es la fricción de fondo de Aaron — el 🔕
      // manual lo resuelve a mano, esto es el piloto automático. Las dormidas se
      // suman a `mutedTopics` y el brief se REARMA: así una señal callada no le
      // roba el cupo a otra, y el push del navegador queda igual que el chat.
      let snoozeUpdates: BriefSignalHistory[] = []
      let snoozedNow = 0
      try {
        const { data: sentRows } = await admin
          .from('brief_sent_signals')
          .select('ref, topic_key, streak_days, last_sent_day, auto_snoozed_at')
          .eq('user_id', uid).limit(500)
        const history: BriefSignalHistory[] = ((sentRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
          ref: String(r.ref ?? ''),
          topicKey: String(r.topic_key ?? ''),
          streakDays: Number(r.streak_days) || 1,
          lastSentDay: (r.last_sent_day as string | null) ?? null,
          autoSnoozedAt: (r.auto_snoozed_at as string | null) ?? null,
        }))
        const decision = applyAutoSnooze(push.signals, history, today, muteRef)
        snoozeUpdates = decision.updates
        snoozedNow = decision.silenced.length
        autoSnoozed += snoozedNow
        if (snoozedNow > 0) {
          push = buildMorningPush({
            ...briefInput,
            mutedTopics: [...mutedTopics, ...decision.silenced.map((s) => s.topicKey)],
          })
          // Al rearmar entran señales que antes no cabían bajo el cap: se
          // re-evalúan con el MISMO historial para que su racha sea la real (no
          // un 1 inventado). Las ya dormidas no vuelven: están en mutedTopics.
          const second = applyAutoSnooze(push.signals, history, today, muteRef)
          const dormidas = decision.updates.filter((u) => u.autoSnoozedAt === today)
          snoozeUpdates = [...second.updates, ...dormidas]
        }
      } catch { /* columnas 0168 sin propagar → brief completo, como antes */ }

      // GATE DE ENERGÍA (docs/CABLEADO.md, cruce #1): el brief mira el CUERPO
      // antes de empujar. La ventana de tolerancia ya calibraba /negociar y
      // /decidir, pero acá —donde Aaron realmente lee— salía el mismo "escríbele
      // a tu mamá para cerrar el conflicto" con 9h de sueño que con 4. Cuando el
      // cuerpo viene bajo, lo que pide combustible emocional se pospone Y SE
      // DICE; lo que vence hoy no se toca. Fail-soft: sin data, brief normal.
      try {
        const bio = await getSelfBioState(admin as unknown as SupabaseClient, uid, now.getTime())
        const { data: lastSleep } = await admin
          .from('sleep_records').select('date, duration, score, awakenings')
          .eq('user_id', uid).lte('date', today)
          .order('date', { ascending: false }).limit(1)
        const ls = (lastSleep ?? [])[0] as { date: string; duration: number | null; score: number | null; awakenings: number | null } | undefined
        // Solo cuenta si es de anoche: un sueño de hace una semana no dice nada de hoy.
        const anoche = ls && ls.date >= previousDay(today)
          ? { durationH: ls.duration, score: ls.score, awakenings: ls.awakenings }
          : null
        const gateInput = {
          windowState: bio.window.state as 'open' | 'watch' | 'narrow' | 'insufficient',
          sleepDebtHours: bio.sleepDebtHours,
          lastNight: anoche,
        }
        const capacity = assessCapacity(gateInput)
        if (capacity !== 'ok') {
          const gate = applyEnergyGate(push.signals, capacity, explainCapacity(gateInput))
          if (gate.note || gate.deferred.length > 0) {
            push = buildMorningPush({
              ...briefInput,
              energyNote: gate.note || undefined,
              mutedTopics: [...mutedTopics, ...gate.deferred.map((s) => topicKey(s.text))],
            })
            energyDeferred += gate.deferred.length
          }
        }
      } catch { /* sin estado bio → el brief va como siempre */ }

      const payload: PushPayload = { title: push.title, body: push.body, url: '/panel', tag: 'morning' }
      const r = await sendPushToUser(sendClient, uid, payload)
      sent += r.sent
      results.push({ user: uid.slice(0, 8), sent: r.sent })

      // Mismo brief, por Telegram, al dueño (proactivo). El contenido es el
      // mismo determinístico; lo persistimos al hilo unificado para que aparezca
      // también en /sir (web). Fail-open: un fallo no rompe el cron.
      if (briefEnabled && tgOwnerId && tgChat && uid === tgOwnerId) {
        // HILO POR SECCIONES (elección de Aaron 2026-07-25): un mensaje corto por
        // tema —⚡ hoy / 💚 tu gente / 🎯 tus metas— en vez de un párrafo con todo
        // pegado, para poder responderle a UNO. Si no hay señales, cae al mensaje
        // único calmo de siempre.
        const thread = buildBriefThread(push.signals)
        const messages = thread.length > 0
          ? thread
          : [{ section: 'hoy' as const, text: formatMorningBriefForChat(push), buttons: [] }]
        let anySent = false
        for (const m of messages) {
          const tg = m.buttons.length > 0
            ? await sendTelegramKeyboard(Number(tgChat), m.text, m.buttons)
            : await sendTelegramMessage(Number(tgChat), m.text)
          if (!tg.ok) continue
          anySent = true
          try {
            await admin.from('sir_messages').insert({ user_id: uid, role: 'sir', content: m.text.slice(0, 4000), channel: 'telegram' })
          } catch { /* fail-open: el hilo es un extra */ }
        }
        if (anySent) telegramBriefs++

      }

      // Log de lo mostrado: resuelve el tap de 🔕 (el callback lleva una ref
      // corta) y lleva la racha del auto-snooze. Se escribe SIEMPRE (no solo en
      // la rama de Telegram): el push del navegador también "dijo" esas señales.
      // Fail-soft.
      try {
        const streakByRef = new Map(snoozeUpdates.map((u) => [u.ref, u]))
        const nowIso = new Date().toISOString()
        const rows = [...push.signals.map((s) => {
          const ref = muteRef(s.text)
          const st = streakByRef.get(ref)
          streakByRef.delete(ref)
          return {
            user_id: uid, ref, topic_key: topicKey(s.text),
            sample_text: s.text.slice(0, 500), section: s.section, slot: s.slot,
            sent_at: nowIso,
            streak_days: st?.streakDays ?? 1,
            last_sent_day: st?.lastSentDay ?? today,
            auto_snoozed_at: st?.autoSnoozedAt ?? null,
          }
        })]
        if (rows.length) await admin.from('brief_sent_signals').upsert(rows, { onConflict: 'user_id,ref' })
        // Las que se durmieron HOY no están en push.signals (se filtraron), pero
        // su estado hay que guardarlo igual o despiertan mañana. Va por UPDATE,
        // no upsert: la fila ya existe y su `sample_text` es lo que el 🔕 usa
        // para saber qué se calló — no hay que pisarlo con vacío.
        for (const u of streakByRef.values()) {
          await admin.from('brief_sent_signals')
            .update({ streak_days: u.streakDays, last_sent_day: u.lastSentDay, auto_snoozed_at: u.autoSnoozedAt })
            .eq('user_id', uid).eq('ref', u.ref)
        }
      } catch { /* tablas 0166/0168 sin propagar → los botones siguen andando */ }
    } catch (e) {
      // Antes se tragaba en silencio: si un bug lógico (no una tabla sin
      // propagar) rompía el armado del brief, el push degradaba a vacío sin
      // dejar traza y no había forma de saber por qué no llegó. Ahora deja
      // rastro en Sentry con el usuario afectado. Sigue fail-soft: el cron no
      // se cae, el resto de usuarios se procesa igual.
      reportApiError(e, { route: 'cron/morning-push', user: uid.slice(0, 8) })
      results.push({ user: uid.slice(0, 8), sent: 0 })
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, sent, telegramBriefs, autoSnoozed, energyDeferred, results }, { status: 200 })
}
