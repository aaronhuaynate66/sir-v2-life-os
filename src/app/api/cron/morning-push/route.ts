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
import { weeklyAdherence, adherenceLine, weekStartOf, type TrainingKind, type MedicalRest } from '@/lib/entrenamiento/adherencia'
import { getSelfBioState } from '@/lib/people/selfState'
import { buildMorningPush, signalTopicKey, type MorningBirthday, type MorningEntities } from '@/lib/push/morning'
import { buildCycleWeekAhead, buildCycleWeekAheadLine, type WomanCycleInput } from '@/lib/ciclo/weekAhead'
import { crossAgendaWithCycles, renderCycleAgendaLine } from '@/lib/ciclo/agendaCross'
import { goalNudgeLine } from '@/lib/push/goalNudge'
import { diagnoseChannel, channelSilenceLine } from '@/lib/reader/channelSilence'
import { evaluarCardio } from '@/lib/health/cardioNotify'
import { goalAdvanceMap, effectiveGoalProgress, lastMovementISO, type GoalAdvance } from '@/lib/goals/advance'
import { evaluarPrecondiciones, lineaTrabada } from '@/lib/goals/precondicion'
import { eventosProximosLine } from '@/lib/push/eventosProximos'
import { detectAffectionDrop, affectionDropLine } from '@/lib/forecast-conductual/affectionDrop'
import { objectiveStepAdapter } from '@/lib/supabase/sync/adapters/objectiveSteps'
import { buildGoalTimingNudge } from '@/lib/goals/timingNudge'
import { contactWasFollowed, contactSuggestionSeed } from '@/lib/suggestions/outcome'
import { sortSpecialDates, formatCountdownPhrase } from '@/lib/dates/specialDates'
import type { SpecialDate } from '@/types'
import { habitNudge, type NudgeHabit } from '@/lib/habits/nudge'
import { bodySignal } from '@/lib/health/bodySignal'
import { vitalsAnomaly, type DailyVitals, type VitalsContext } from '@/lib/health/vitalsAnomaly'
import { calibrateRanges, type VitalsHistory } from '@/lib/health/calibrate'
import { healthDataGap } from '@/lib/health/dataGap'
import { parseWeightCategory } from '@/engines/targets'
import { assessWeightTrend, renderWeightTrendLine } from '@/lib/targets/weightTrend'
import { assembleDailyActions } from '@/lib/daily-actions/assemble'
import { labPatterns, labAlertPushLine } from '@/lib/health-exams/patterns'
import { examenRecienteLine } from '@/lib/health-exams/recentExam'
import { cumpleanosProximos, esHitoDeAnticipacion } from '@/lib/push/cumpleanos'
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

// 7 días: alcanza para conseguir un regalo. Antes 5.
const BIRTHDAY_WINDOW_DAYS = 7
/** Ventana para avisar de un aniversario/fecha especial (incluye el mensario).
 *  Corta: un aniversario es puntual, no un evento de agenda semanal. */
// 10 días. Antes eran **2**, y Aaron cargó su aniversario con Diana "con la
// intención de anticiparme": con 2 días no se reserva ni se compra nada. Para que
// no sea la misma línea 10 días seguidos, solo se avisa en HITOS (ver
// ).
const ANNIVERSARY_WINDOW_DAYS = 10

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
        .select('name, birth_date, special_dates, importance_score')
        .eq('user_id', uid)
        .limit(1000)
      const people = (peopleRows ?? []) as Array<{ name: string; birth_date: string | null; special_dates: unknown; importance_score: number | null }>

      // CUMPLEAÑOS DE LAS DOS FUENTES. Antes salían solo de `birth_date`, y el otro
      // camino (`importantDates`, abajo) descartaba las etiquetas con "cumple"
      // creyendo que este las tomaba. **El dato se caía entre los dos.**
      //
      // Aaron, 31-jul-2026: *"hoy es cumpleaños de Alex y SIR brilló por su
      // ausencia, pero POR QUÉ???"*. Medido ese día sobre su base: **129 personas,
      // solo 3 con `birth_date`, y 21 cumpleaños viviendo solo en `special_dates`**
      // — invisibles. Ese día había DOS (Alex Heilbrunn, importancia 9, y Walter, 7)
      // y el brief no dijo ninguno. No era un borde: era la ruta de casi todos.
      const birthdays: MorningBirthday[] = cumpleanosProximos(
        people.map((p) => ({
          name: p.name,
          birth_date: p.birth_date,
          fechas: toSpecialDates(p.special_dates),
          importance: p.importance_score,
        })),
        today,
        BIRTHDAY_WINDOW_DAYS,
      ).map((c) => ({ name: c.name, days: c.days }))

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
          // Solo en hitos: 10, 7, 3, 2, 1 y 0 días. Ampliar la ventana sin esto
          // repetiría la misma línea diez días seguidos.
          if (!esHitoDeAnticipacion(cd.daysUntil)) continue
          importantDatesRanked.push({ text: `${cd.sd.label} · ${formatCountdownPhrase(cd)}`, days: cd.daysUntil })
        }
      }
      importantDatesRanked.sort((a, b) => a.days - b.days)
      const importantDates = importantDatesRanked.slice(0, 3).map((d) => d.text)

      // LO QUE SE VIENE: `personal_events` de los próximos 7 días.
      //
      // Este bloque nació de una fricción directa (30-jul). Aaron: *"Laura me escribió
      // diciéndome que este sábado es su matrimonio religioso, y no veo ninguna alerta,
      // recordatorio o fecha que indique eso"*. Y ESTABA CARGADO: la fila existía con
      // fecha y con Laura vinculada. El problema era que `personal_events` se leía SOLO
      // por el cruce del ciclo menstrual (#978), que surfacea un evento únicamente si la
      // persona está en ventana sensible. Faltaba el recordatorio a secas.
      let eventosProximosText: string | undefined
      try {
        const { data: evRows } = await admin
          .from('personal_events')
          .select('title, event_date, person_id')
          .eq('user_id', uid)
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(20)
        const crudos = ((evRows ?? []) as Array<{ title: string | null; event_date: string | null; person_id: string | null }>)
          .filter((e) => e.title && e.event_date)
        // El nombre de la persona es lo que hace que el recordatorio importe ("la
        // boda de LAURA"), así que se resuelve — pero solo para los ids que de
        // verdad aparecen, no toda la agenda.
        const pids = [...new Set(crudos.map((e) => e.person_id).filter(Boolean))] as string[]
        const nombrePorId = new Map<string, string>()
        if (pids.length > 0) {
          const { data: pplRows } = await admin.from('people').select('id, name').eq('user_id', uid).in('id', pids)
          for (const r of (pplRows ?? []) as Array<{ id: string; name: string }>) nombrePorId.set(r.id, r.name)
        }
        const evs = crudos.map((e) => ({
          date: e.event_date!,
          title: e.title!,
          personName: e.person_id ? nombrePorId.get(e.person_id) ?? null : null,
        }))
        eventosProximosText = eventosProximosLine(evs, today) ?? undefined
      } catch (e) {
        reportApiError(e, { route: 'cron/morning-push', step: 'eventosProximos', user: uid.slice(0, 8) })
      }

      // ═══ DESPLOME DE AFECTO ═══════════════════════════════════════════════
      //
      // Aaron, 31-jul-2026: *"por qué no tengo ninguna alerta de cómo viene mi
      // relación con Diana si mis últimas conversaciones tan hasta las webas"*.
      //
      // El IAE medía el afecto por día desde el 23-jul y NADA de eso llegaba al
      // brief: vivía en una card de la web y en el contexto del chat. Y el resumen
      // que sí existía promedia 30 días, así que el 31-jul —un día después de la
      // pelea— decía "muy positivo, viene subiendo" (medido). Ver `affectionDrop.ts`.
      //
      // Se mira solo a la gente importante: el detector necesita una línea base
      // personal de semanas, y con un conocido no hay nada honesto que decir.
      let afectoCaidaText: string | undefined
      try {
        const { data: pplRows } = await admin
          .from('people').select('id, name')
          .eq('user_id', uid).gte('importance_score', 7).limit(20)
        const gente = (pplRows ?? []) as Array<{ id: string; name: string }>
        const candidatas: Array<{ nombre: string; drop: ReturnType<typeof detectAffectionDrop> }> = []
        for (const p of gente) {
          const { data: sigRows } = await admin
            .from('person_daily_signals')
            .select('date, message_count, avg_len, somatic, friction, withdrawal, sensitivity, actions, composite, affection, positivity_ratio')
            .eq('user_id', uid).eq('person_id', p.id)
            .order('date', { ascending: true }).limit(400)
          const serie = ((sigRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
            date: r.date as string, messageCount: Number(r.message_count) || 0, avgLen: Number(r.avg_len) || 0,
            somatic: Number(r.somatic) || 0, friction: Number(r.friction) || 0, withdrawal: Number(r.withdrawal) || 0,
            sensitivity: Number(r.sensitivity) || 0, actions: Number(r.actions) || 0, composite: Number(r.composite) || 0,
            affection: Number(r.affection) || 0,
            positivityRatio: r.positivity_ratio == null ? 1 : Number(r.positivity_ratio) || 1,
          }))
          const drop = detectAffectionDrop(serie)
          if (drop && drop.motivos.length > 0) candidatas.push({ nombre: p.name, drop })
        }
        // UNA sola línea, la más fuerte. Dos vínculos en tensión el mismo día es
        // un muro, y el brief ya se quejó de eso antes (#1039).
        candidatas.sort((a, b) =>
          (b.drop!.motivos.length - a.drop!.motivos.length) || (a.drop!.ratioReciente - b.drop!.ratioReciente))
        const top = candidatas[0]
        if (top) afectoCaidaText = affectionDropLine(top.nombre, top.drop) ?? undefined
      } catch (e) {
        reportApiError(e, { route: 'cron/morning-push', step: 'afectoCaida', user: uid.slice(0, 8) })
      }

      // Tareas que vencen hoy (no hechas).
      //
      // Se trae el OBJETIVO al que cuelgan por dos razones que salieron de una
      // fricción real (29-jul). Aaron sobre el aviso de la factura de S/1.500:
      // *"ni siquiera sé de qué o por qué o a quién, y pregunto y no tengo
      // respuesta… sin que esté amarrado a algún objetivo solo me está haciendo
      // ruido"*. El paso tenía TODO cargado desde el 3-jun (descripción, criterio,
      // cliente) y el brief mostraba solo el título.
      //   1. El objetivo se nombra en la línea → deja de ser un aviso huérfano.
      //   2. Se descartan los pasos de objetivos PAUSADOS: el de la factura cuelga
      //      de "Cerrar Boticas Jhodaal", que se pausó el 28-jul, y su tarea
      //      seguía disparando igual.
      //   3. Y falta una tercera, que se agregó el 30-jul: un paso con fecha se
      //      anunciaba como "vence hoy" SIN MIRAR si lo que va antes ya pasó. Pasó
      //      de nuevo, y esta vez el aviso falso lo dio la sesión a mano: "facturar
      //      y cobrar el primer mes de consultoría" vencía el 31-jul mientras
      //      "cerrar el primer contrato" vencía el 8-jul y seguía pendiente, y los
      //      3 deals reales estaban en 'lead'. Aaron: "estamos cayendo en el mismo
      //      error". Ver `lib/goals/precondicion.ts`.
      const { data: stepRows } = await admin
        .from('objective_steps')
        .select('id, title, target_date, status, description, objective_id, goals!inner(title, status)')
        .eq('user_id', uid)
        .eq('target_date', today)
        // Ni hechos ni DESCARTADOS: un paso que ya no es del plan no vence.
        .not('status', 'in', '(hecho,descartado)')
        .limit(50)
      const dueStepRows = ((stepRows ?? []) as unknown[])
        .map((raw) => {
          const s = raw as { id: string; title: string; description?: string | null; objective_id?: string | null; goals?: unknown }
          const g = Array.isArray(s.goals) ? s.goals[0] : s.goals
          const meta = (g ?? null) as { title?: string; status?: string } | null
          return { id: s.id, title: s.title, description: s.description ?? null, objectiveId: s.objective_id ?? null, goalTitle: meta?.title ?? null, goalStatus: meta?.status ?? null }
        })
        // Un objetivo pausado o archivado no genera pendientes del día.
        .filter((s) => s.goalStatus !== 'paused' && s.goalStatus !== 'archived' && s.goalStatus !== 'completed')
      // PRECONDICIONES: para saber si un paso de hoy es de verdad accionable hay que
      // ver a sus HERMANOS del mismo key result, no solo a él. Se traen los pasos de
      // los objetivos involucrados y se evalúa el conjunto. Fail-soft: si esto falla,
      // se cae al comportamiento anterior (anunciar la fecha tal cual).
      let trabados = new Map<string, ReturnType<typeof evaluarPrecondiciones> extends Map<string, infer V> ? V : never>()
      try {
        const objIds = [...new Set(dueStepRows.map((s) => s.objectiveId).filter(Boolean))] as string[]
        if (objIds.length > 0) {
          const { data: hermanos } = await admin
            .from('objective_steps')
            .select('id, title, status, target_date, sort_order, parent_id, objective_id, blocked_by')
            .eq('user_id', uid).in('objective_id', objIds).limit(500)
          trabados = evaluarPrecondiciones(
            ((hermanos ?? []) as Array<Record<string, unknown>>).map((r) => ({
              id: String(r.id), title: String(r.title ?? ''),
              objectiveId: (r.objective_id as string) ?? null,
              parentId: (r.parent_id as string) ?? null,
              status: (r.status as string) ?? null,
              targetDate: (r.target_date as string) ?? null,
              sortOrder: typeof r.sort_order === 'number' ? r.sort_order : null,
              blockedBy: (r.blocked_by as string | string[] | null) ?? null,
            })),
            today,
          )
        }
      } catch (e) {
        reportApiError(e, { route: 'cron/morning-push', step: 'precondiciones', user: uid.slice(0, 8) })
      }

      const dueTasks = dueStepRows
        .map((s) => {
          const v = trabados.get(s.id)
          // Trabado → se dice DÓNDE está trabado en vez de callarlo. Un pendiente que
          // desaparece sin explicación es el mismo problema del aviso huérfano con
          // otra cara ("no sé de qué ni a quién").
          const trabada = v ? lineaTrabada(s.title, v) : null
          if (trabada) return s.goalTitle ? `${trabada} (de "${s.goalTitle}")` : trabada
          return s.goalTitle ? `${s.title} — de "${s.goalTitle}"` : s.title
        })
        .filter(Boolean)
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

      // AVANCE REAL de cada objetivo, desde `objective_steps`.
      // Antes el nudge usaba `goals.progress` a secas — un escalar que SOLO se
      // recalcula cuando /objetivos está montada en el navegador, así que en el
      // cron llegaba congelado en 0 y el brief anunciaba "vas 0%" sobre
      // objetivos con veinte pasos reales debajo. Mismo patrón que el "distante"
      // falso de #941: medir con la tabla equivocada.
      let advances = new Map<string, GoalAdvance>()
      try {
        const { data: allStepRows, error: stepsErr } = await admin
          .from('objective_steps')
          .select('*')
          .eq('user_id', uid)
          .limit(1000)
        // PostgREST no lanza: el error viene en `.error` (misma trampa que #947).
        if (stepsErr) throw new Error(stepsErr.message)
        const steps = ((allStepRows ?? []) as Array<Record<string, unknown>>).map((r) =>
          objectiveStepAdapter.fromRow(r),
        )
        advances = goalAdvanceMap(steps, goals.map((g) => g.id), today)
      } catch (e) {
        // Fail-soft: sin pasos el nudge cae al progreso manual, como antes.
        reportApiError(e, { route: 'cron/morning-push', step: 'goalAdvance', user: uid.slice(0, 8) })
      }

      // ¿ALGÚN CANAL DEL READER SE QUEDÓ MUDO? Cruza el latido de la extensión
      // (reader_heartbeats, mig 0175) con la última vez que cada canal trajo algo.
      // Nació de los 7 días en que WhatsApp estuvo caído mientras Instagram
      // seguía andando, así que el reader parecía sano desde afuera.
      //
      // AGUJERO DE ARRANQUE ARREGLADO (medido el 30-jul-2026). Antes, TODO este
      // bloque estaba dentro de `if (hbs.length > 0)`. `reader_heartbeats` tenía
      // CERO filas, así que la alarma no corría nunca — y estaba en cero justo
      // porque la extensión de la otra PC es anterior al latido, que es el fallo
      // que la alarma tiene que detectar. Circular: sin latido no hay diagnóstico,
      // y sin diagnóstico nadie avisa que falta actualizar para que lata.
      // Mientras eso pasaba, los datos de WhatsApp llevaban parados desde el
      // 25-jul y el brief no dijo una palabra.
      //
      // La lista de canales sale ahora de los DATOS OBSERVADOS, no de la tabla de
      // latidos: si un canal trajo algo alguna vez, existe y se puede diagnosticar
      // aunque nunca haya latido. El latido REFINA el diagnóstico; no es la
      // condición para tenerlo. (Regla de honestidad de cobertura de CLAUDE.md
      // aplicada al propio detector: no concluir desde una vista vacía.)
      let readerSilenceText: string | undefined
      try {
        const [{ data: hbRows }, { data: lastMsg }, { data: lastIg }, { data: lastPerfil }, { data: lastSeguidor }] = await Promise.all([
          admin.from('reader_heartbeats')
            .select('channel, last_beat_at, status, last_data_at')
            .eq('user_id', uid).limit(20),
          admin.from('chat_messages').select('sent_at')
            .eq('user_id', uid).eq('source', 'reader')
            .not('sent_at', 'is', null)
            .order('sent_at', { ascending: false }).limit(1),
          admin.from('unmatched_social_activity').select('observed_at')
            .eq('user_id', uid).eq('platform', 'instagram')
            .order('observed_at', { ascending: false }).limit(1),
          // `unmatched_social_activity` es una BANDEJA: sus filas se BORRAN al
          // resolver la cuenta. Apoyar la frescura de Instagram solo en ella la
          // hacía depender de que quedaran cuentas SIN resolver — y el brief
          // nocturno le pide a Aaron resolverlas (30 por noche). O sea: mientras
          // más hacía lo que SIR le pedía, más ciego quedaba este detector, y al
          // vaciar la bandeja habría dicho "Instagram nunca trajo nada" con 11
          // perfiles y 17 seguidores ahí al lado. Estas dos tablas SOBREVIVEN a
          // la resolución, así que son la señal honesta.
          admin.from('social_profiles').select('captured_at')
            .eq('user_id', uid).eq('platform', 'instagram')
            .order('captured_at', { ascending: false }).limit(1),
          admin.from('social_page_followers').select('observed_at')
            .eq('user_id', uid).eq('source', 'instagram')
            .order('observed_at', { ascending: false }).limit(1),
        ])
        const hbs = (hbRows ?? []) as Array<{ channel: string; last_beat_at: string | null; status: string | null; last_data_at: string | null }>
        // Última data REAL por canal, que es la verdad de campo. `last_data_at`
        // de la tabla se usa si está, pero no se depende de él: la migración 0175
        // dice que "lo actualiza el endpoint de ingesta" y hasta hoy nadie lo
        // escribía (este PR lo arregla; las filas viejas siguen en null).
        // De varias fuentes, la MÁS RECIENTE: cada una ve un pedazo distinto de lo
        // que trajo el canal, y quedarse con la más vieja subdiagnosticaría.
        const masReciente = (...isos: Array<string | null | undefined>): string | null => {
          let mejor: string | null = null
          for (const iso of isos) {
            if (!iso) continue
            const t = Date.parse(iso)
            if (!Number.isFinite(t)) continue
            if (mejor === null || t > Date.parse(mejor)) mejor = iso
          }
          return mejor
        }
        const dataPorCanal: Record<string, string | null> = {
          whatsapp: ((lastMsg ?? []) as Array<{ sent_at: string | null }>)[0]?.sent_at ?? null,
          instagram: masReciente(
            ((lastIg ?? []) as Array<{ observed_at: string | null }>)[0]?.observed_at,
            ((lastPerfil ?? []) as Array<{ captured_at: string | null }>)[0]?.captured_at,
            ((lastSeguidor ?? []) as Array<{ observed_at: string | null }>)[0]?.observed_at,
          ),
        }
        // Canales a diagnosticar = los que latieron ∪ los que trajeron datos.
        const canales = new Set<string>(hbs.map((h) => h.channel))
        for (const [c, iso] of Object.entries(dataPorCanal)) if (iso) canales.add(c)

        if (canales.size > 0) {
          const porCanal = new Map(hbs.map((h) => [h.channel, h]))
          const verdicts = [...canales].map((channel) => {
            const h = porCanal.get(channel)
            return diagnoseChannel({
              channel,
              lastHeartbeatAt: h?.last_beat_at ?? null,
              lastDataAt: h?.last_data_at ?? dataPorCanal[channel] ?? null,
              status: h?.status ?? null,
            }, now)
          })
          readerSilenceText = channelSilenceLine(verdicts, now) ?? undefined
        }
      } catch (e) {
        reportApiError(e, { route: 'cron/morning-push', step: 'readerSilence', user: uid.slice(0, 8) })
      }

      // OPORTUNIDAD / ENFRIAMIENTO detectado en las conversaciones. Acá solo se
      // LEE lo que el cron de oportunidades ya detectó y juzgó (corre 09:40 UTC,
      // 20 min antes): el brief no puede depender de una llamada LLM para salir.
      // Solo las 'pending' — lo que Aaron registró o descartó no vuelve.
      let opportunityText: string | undefined
      try {
        const { data: oppRows, error: oppErr } = await admin
          .from('opportunity_signals')
          .select('id, person_name, what, kind, quote, quote_at, days_since_quote, days_since_last')
          .eq('user_id', uid).eq('state', 'pending')
          .order('detected_at', { ascending: false })
          .limit(3)
        if (oppErr) throw new Error(oppErr.message)
        const opps = (oppRows ?? []) as Array<{
          id: string; person_name: string; what: string; kind: string
          quote: string; quote_at: string; days_since_quote: number | null; days_since_last: number | null
        }>
        if (opps.length > 0) {
          const o = opps[0]
          const fecha = o.quote_at.slice(0, 10)
          const cola = opps.length > 1 ? ` (+${opps.length - 1} señal(es) comercial(es) más)` : ''
          opportunityText = o.kind === 'oportunidad_sin_registrar'
            ? `💼 ${o.person_name} te pidió ${o.what} y no está como oportunidad — «${o.quote}» (${fecha}). ¿La registro?${cola}`
            : `🧊 Se está enfriando con ${o.person_name}: te pidió ${o.what} y hace ${o.days_since_last} días que no se escriben — «${o.quote}» (${fecha}).${cola}`
          briefEntities.opportunity = { id: o.id, name: o.person_name }
        }
      } catch (e) {
        // Fail-soft: sin esto el brief sale igual, solo sin la señal comercial.
        reportApiError(e, { route: 'cron/morning-push', step: 'opportunities', user: uid.slice(0, 8) })
      }

      // NUDGE DE OBJETIVO: norte estancado o meta en riesgo. SIR ya lo computa
      // (norteDrift / goal engine) pero vivía en un panel; acá lo saca al push.
      const goalNudgeText = goalNudgeLine(
        goals.map((g) => {
          const adv = advances.get(g.id)
          return {
            title: g.title,
            isAnchor: g.is_anchor === true,
            progress: effectiveGoalProgress(adv, g.progress),
            targetDate: g.target_date,
            // Cerrar un paso ES mover el objetivo. Sin esto, el detector de
            // "estancado" solo veía ediciones del objetivo y marcaba parado
            // un norte en el que se avanzó toda la semana.
            updatedAt: lastMovementISO(adv, g.updated_at) ?? new Date(0).toISOString(),
          }
        }),
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
        const goalByPerson = new Map<string, { goalTitle: string; pendingAction: string; goalUpdatedAt: string | null }>()
        for (const g of goals) {
          const action = (g.next_action ?? '').trim()
          if (!action) continue
          for (const pid of g.related_persons ?? []) {
            if (typeof pid === 'string' && pid && !goalByPerson.has(pid)) {
              goalByPerson.set(pid, { goalTitle: g.title, pendingAction: action, goalUpdatedAt: g.updated_at ?? null })
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
                ? [{ personName: name, goalTitle: g.goalTitle, pendingAction: g.pendingAction, signalDetail: 'anda activa hoy', observedAt: r.observed_at, goalUpdatedAt: g.goalUpdatedAt }]
                : []
            })
            goalTimingText = buildGoalTimingNudge(cands, now) ?? undefined
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

        // CONTEXTO para que la línea no diga "puede ser una noche floja" cuando hay
        // un evento médico que explica la carga. El 29-jul las señales de Aaron
        // gritaban (VFC 34 con piso 54, FC en sueño 68 con techo 55, tercer día
        // cayendo) dos días después de un trauma facial y con tramadol, y el módulo
        // —que solo contaba señales de UN día— lo llamaba noche floja.
        // Fail-soft: sin contexto la línea sigue saliendo, solo menos específica.
        const contexto: VitalsContext = {}
        try {
          const corre = (dias: number) => new Date(Date.parse(`${today}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
          const desde = corre(-10), hasta = corre(7)
          // OJO con el `select`: `personal_events` NO tiene columna `kind`. Pedirla
          // hace que PostgREST devuelva error —en `.error`, sin lanzar— y el catch
          // se lo tragaba dejando el contexto vacío en silencio. Cazado el 29-jul
          // justamente escribiendo esto.
          const { data: evSalud, error: evErr } = await admin
            .from('personal_events')
            .select('title, event_date, end_date')
            .eq('user_id', uid)
            .gte('event_date', desde).lte('event_date', hasta)
            .limit(50)
          if (evErr) throw new Error(evErr.message)
          const evs = ((evSalud ?? []) as Array<{ title: string; event_date: string; end_date: string | null }>)
            .map((e) => ({ ...e, dia: (e.event_date ?? '').slice(0, 10) }))
          const pasados = evs.filter((e) => e.dia <= today).sort((a, b) => (a.dia < b.dia ? 1 : -1))
          const futuros = evs.filter((e) => e.dia > today).sort((a, b) => (a.dia < b.dia ? -1 : 1))
          const esMedico = (t: string) => /m[eé]dic|cl[ií]nic|cita|control|examen|maxilofacial|dentista|cirug|reposo|golpe|accidente|trauma/i.test(t)
          const ultimo = pasados.find((e) => esMedico(e.title))
          const proxima = futuros.find((e) => esMedico(e.title))
          if (ultimo) contexto.eventoReciente = ultimo.title
          if (proxima) contexto.citaProxima = proxima.title
        } catch { /* sin contexto: la línea sale igual */ }

        const anomaly = vitalsAnomaly([...byDate.values()], ranges, contexto)
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
      //
      // EXAMEN RECIENTE, en cambio, NO va gateado por lunes. El gate semanal es
      // correcto para lo crónico y equivocado para lo agudo: la tomografía del
      // 27-jul-2026 entró con 11 recomendaciones —una con ventana de 5 a 7 días
      // (hematoma septal)— y el brief no la iba a nombrar hasta el lunes siguiente,
      // con la ventana ya cerrada. Y ni entonces: `labAlertPushLine` deriva de
      // valores NUMÉRICOS y un examen de imagen no tiene ninguno. Era invisible por
      // dos motivos a la vez. Ver `lib/health-exams/recentExam.ts`.
      let healthWatchText: string | undefined
      let examenRecienteText: string | undefined
      try {
        const { data: examRows } = await admin
          .from('health_exams')
          .select('id, exam_date, provider, title, summary, findings, values, recommendations, storage_path')
          .eq('user_id', uid)
          .order('exam_date', { ascending: true })
          .limit(50)
        const exams = (examRows ?? []).map((r) => ({ ...rowToHealthExam(r as Record<string, unknown>), pdfUrl: null }))
        // Crónico: tendencias entre exámenes. Semanal, y necesita al menos dos.
        if (isMondayLima && exams.length >= 2) {
          const line = labAlertPushLine(labPatterns(exams))
          if (line) healthWatchText = line
        }
        // Agudo: un examen de los últimos 14 días con recomendaciones. Cualquier día,
        // y con UNO solo alcanza.
        examenRecienteText = examenRecienteLine(exams, today) ?? undefined
      } catch {
        /* fail-soft: la tabla puede no haber propagado aún */
      }

      // TENDENCIA CARDÍACA. Solo el canal 'manana' llega acá: lo que apremia ya
      // se mandó solo cuando entró la medición (ver `cardioNotify`, cableado en
      // los endpoints de ingesta de salud). `soloDiagnosticar` garantiza que este
      // cron NO manda Telegram por su cuenta — si lo hiciera, el mismo hallazgo
      // saldría dos veces, una por el aviso inmediato y otra dentro del brief.
      let cardioTrendText: string | undefined
      try {
        const c = await evaluarCardio(admin, uid, { soloDiagnosticar: true })
        if (c.canal === 'manana' && c.texto) cardioTrendText = c.texto
      } catch (e) {
        reportApiError(e, { route: 'cron/morning-push', step: 'cardioTrend', user: uid.slice(0, 8) })
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
          // REPOSO MÉDICO: si un médico lo mandó a descansar, la adherencia no
          // reclama. El 29-jul el brief lo apuró a levantar pesas al segundo día
          // de un descanso de 4 días por traumatismo facial. Un nudge de
          // rendimiento nunca debe pasar por encima de un reposo indicado.
          let rest: MedicalRest | null = null
          const { data: restRows } = await admin
            .from('personal_events')
            .select('title, event_date, end_date, note')
            .eq('user_id', uid)
            .or('title.ilike.%descanso médico%,title.ilike.%descanso medico%,title.ilike.%reposo%')
            .gte('end_date', monday)
            .order('event_date', { ascending: false })
            .limit(3)
          const r0 = ((restRows ?? []) as Array<{ title: string; event_date: string; end_date: string | null }>)[0]
          if (r0?.end_date) rest = { from: r0.event_date, to: r0.end_date, reason: 'indicación médica' }

          const a = weeklyAdherence(sessions, { total: 4, ofKind: { kind: 'fuerza', count: 3 } }, today)
          trainingAdherenceText = adherenceLine(a, rest, today) ?? undefined
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

      const briefInput = { birthdays, importantDates, relationshipNudge: relationshipNudgeText, momentResolution: momentResolutionText, cycleWeekAhead: cycleWeekAheadText, cycleAgenda: cycleAgendaText, goalContactTiming: goalTimingText, dueTasks, focus, goalNudge: goalNudgeText, trainingAdherence: trainingAdherenceText, topSignal, habitNudge: habitNudgeText, bodySignal: bodySignalText, weekFocus: weekFocusText, metricAlert: metricAlertText, healthWatch: healthWatchText, opportunity: opportunityText, readerSilence: readerSilenceText, cardioTrend: cardioTrendText, eventosProximos: eventosProximosText, afectoCaida: afectoCaidaText, examenReciente: examenRecienteText, entities: briefEntities }
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
              mutedTopics: [...mutedTopics, ...gate.deferred.map((s) => signalTopicKey(s.slot, s.text))],
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
          const ref = muteRef(s.text, s.slot)
          const st = streakByRef.get(ref)
          streakByRef.delete(ref)
          return {
            user_id: uid, ref, topic_key: signalTopicKey(s.slot, s.text),
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
