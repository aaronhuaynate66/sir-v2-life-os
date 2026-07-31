// SIR V2 — GET/POST /api/forecast (forecast conductual, 2º horizonte)
//
// POST { personId }: reúne los mensajes de las observaciones whatsapp_chat de la
// persona → señales diarias (léxico, SIN LLM) → ensamble → persiste señales +
// forecast. GET ?personId=: devuelve el último forecast. Anclas = person_cycles.
// Auth + RLS. Ético (doc 17): ventana de PATRÓN, no período.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { buildDailySignals } from '@/lib/forecast-conductual/dailySignals'
import { fetchChatMessages } from '@/lib/chat-messages/read'
import { runForecast } from '@/lib/forecast-conductual/engine'
import { summarizeAffection } from '@/lib/forecast-conductual/affectionSummary'
import { planTopUpSignals, necesitaTopUp } from '@/lib/forecast-conductual/topUpSignals'
import { limaDayKey } from '@/lib/dates/limaDay'
import { recalibrate, modelWeights, type FeedbackLabel } from '@/lib/forecast-conductual/recalibrate'
import type { ChatMessage, CycleAnchor, DailySignal } from '@/lib/forecast-conductual/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

const FORECAST_COLS = 'id, run_at, mode, center_date, main_window_start, main_window_end, extended_window_start, extended_window_end, period_days, confidence_label, confidence_score, dominant_models, interpretation, result'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado')
  const personId = req.nextUrl.searchParams.get('personId')
  if (!personId) return errorJson(400, 'personId requerido')
  try {
    const { data } = await supabase
      .from('behavior_forecasts')
      .select(FORECAST_COLS)
      .eq('user_id', auth.user.id).eq('person_id', personId)
      .order('run_at', { ascending: false }).limit(1)
    return NextResponse.json({ forecast: (data ?? [])[0] ?? null })
  } catch {
    return NextResponse.json({ forecast: null })
  }
}

interface RawMsg { iso?: unknown; author?: unknown; content?: unknown }

/**
 * Día del último mensaje de la persona en el sustrato, o null.
 *
 * Barato a propósito (una fila): es el atajo que decide si vale la pena bajar 50k
 * mensajes para poner la serie al día. `chat_messages.sent_at` guarda hora de PARED
 * de Lima (documentado en `chat-messages/append`), así que cortar a 10 caracteres ya
 * da el día en Lima — no hay que convertir nada.
 */
async function lastMessageDay(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string, personId: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('chat_messages').select('sent_at')
      .eq('user_id', userId).eq('person_id', personId)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false }).limit(1)
    const iso = ((data ?? []) as Array<{ sent_at: string | null }>)[0]?.sent_at
    return typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : null
  } catch {
    return null // fail-soft: sin el atajo, el top-up simplemente no se dispara
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado')
  const userId = auth.user.id

  let body: { personId?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  if (!personId) return errorJson(400, 'personId requerido')

  try {
    // 1) Señales diarias, en orden de riqueza:
    //    a) person_daily_signals (precomputadas al importar el export entero).
    //    b) SUSTRATO (chat_messages, mig 0141): el hilo real ya cargado — evita
    //       pedir "re-importá" cuando la data ya está, solo en otra tabla.
    //    c) MUESTRA reciente de rawMessages de la observación (span corto, legacy).
    //    En (b)/(c) se derivan con el léxico y se persisten a person_daily_signals.
    let signals: DailySignal[] = []
    const { data: sigRows } = await supabase
      .from('person_daily_signals')
      .select('date, message_count, avg_len, somatic, friction, withdrawal, sensitivity, actions, composite, affection, positivity_ratio')
      .eq('user_id', userId).eq('person_id', personId)
      .order('date', { ascending: true }).limit(2000)
    if (sigRows && sigRows.length >= 10) {
      signals = (sigRows as Record<string, unknown>[]).map((r) => ({
        date: r.date as string, messageCount: Number(r.message_count) || 0, avgLen: Number(r.avg_len) || 0,
        somatic: Number(r.somatic) || 0, friction: Number(r.friction) || 0, withdrawal: Number(r.withdrawal) || 0,
        sensitivity: Number(r.sensitivity) || 0, actions: Number(r.actions) || 0, composite: Number(r.composite) || 0,
        affection: Number(r.affection) || 0, positivityRatio: r.positivity_ratio == null ? 1 : Number(r.positivity_ratio) || 1,
      }))

      // ═══ TOP-UP: la serie guardada NO es la verdad, es un caché ═══════════
      //
      // Acá había un candado que costó caro. `sigRows.length >= 10` daba las filas
      // por completas y no se volvía a mirar el sustrato NUNCA. Y como los únicos
      // que escriben esta tabla son el import manual del export y esta ruta, la
      // serie de una persona se congelaba pasado el décimo día.
      //
      // Medido el 31-jul-2026: Diana con **820 filas y la más nueva del 8-jul**, 23
      // días congelada, mientras el reader traía mensajes todos los días. El mes
      // entero del deterioro que Aaron estaba viviendo —el pico de 252 mensajes del
      // 24-jul, el incidente del 27, la pelea del 30— NO ESTABA MEDIDO. Y el
      // backfill de afecto de abajo tampoco lo salvaba: solo salta si TODAS las
      // filas vienen en null, y ella tenía 624 con valor.
      //
      // Ahora se pone al día lo que falta (ver `topUpSignals.ts`). El atajo
      // `necesitaTopUp` evita bajar 50k mensajes cuando ya está al día.
      const storedDates = (sigRows as { date: string }[]).map((r) => r.date)
      let ultimoGuardado: string | null = null
      for (const d of storedDates) if (ultimoGuardado === null || d > ultimoGuardado) ultimoGuardado = d
      const ultimaActividad = await lastMessageDay(supabase, userId, personId)

      // El backfill del afecto sigue valiendo aparte: las filas de antes de #924 lo
      // tienen en null aunque su día esté "cubierto", así que el top-up por fecha no
      // las alcanza.
      const affectionStale = (sigRows as { affection: unknown }[]).every((r) => r.affection == null)

      if (affectionStale || necesitaTopUp(ultimoGuardado, ultimaActividad)) {
        const subRows = await fetchChatMessages(supabase, userId, personId, 50_000)
        const subMessages: ChatMessage[] = subRows
          .filter((r) => typeof r.sent_at === 'string' && r.sent_at.length >= 10)
          .map((r) => ({ at: r.sent_at as string, author: r.sender === 'user' ? 'user' : 'other', text: r.content ?? '', kind: r.is_media ? 'media' : 'text' }))
        if (subMessages.length > 0) {
          const { rows: topUp, serie } = planTopUpSignals({
            userId, personId, messages: subMessages,
            // Con el afecto viejo en null hay que reescribir TODOS los días, no solo
            // los que faltan por fecha: pasar `storedDates` vacío fuerza eso.
            storedDates: affectionStale ? [] : storedDates,
            hoy: limaDayKey(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10),
            nowIso: new Date().toISOString(),
          })
          if (topUp.length > 0) await supabase.from('person_daily_signals').upsert(topUp, { onConflict: 'id' })
          // La serie recién calculada MANDA sobre la guardada en los días que cubre:
          // es la que acaba de leer el sustrato. Los días que el sustrato no tiene
          // (importados de un export viejo y ya purgado) se conservan.
          const frescaPorDia = new Map(serie.map((s) => [s.date, s]))
          const cubiertos = new Set(signals.map((s) => s.date))
          signals = signals.map((s) => frescaPorDia.get(s.date) ?? s)
          for (const s of serie) if (!cubiertos.has(s.date)) signals.push(s)
          signals.sort((a, b) => a.date.localeCompare(b.date))
        }
      }
    } else {
      // b) Sustrato: el hilo textual completo de la persona (léxico → señales).
      const subRows = await fetchChatMessages(supabase, userId, personId, 50_000)
      const subMessages: ChatMessage[] = subRows
        .filter((r) => typeof r.sent_at === 'string' && r.sent_at.length >= 10)
        .map((r) => ({
          at: r.sent_at as string,
          author: r.sender === 'user' ? 'user' : 'other',
          text: r.content ?? '',
          kind: r.is_media ? 'media' : 'text',
        }))
      signals = buildDailySignals(subMessages)

      // c) Fallback legacy: la muestra reciente de rawMessages de la observación.
      if (signals.length < 8) {
        const { data: obs } = await supabase
          .from('observations').select('data')
          .eq('user_id', userId).eq('person_id', personId)
          .eq('capture_type', 'whatsapp_chat').eq('is_obsolete', false).limit(20)
        const messages: ChatMessage[] = []
        for (const row of (obs ?? []) as { data: { rawMessages?: RawMsg[] } }[]) {
          for (const m of (Array.isArray(row.data?.rawMessages) ? row.data.rawMessages : [])) {
            const at = typeof m.iso === 'string' && m.iso.length >= 10 ? m.iso : null
            if (!at) continue
            messages.push({ at, author: m.author === 'user' ? 'user' : 'other', text: typeof m.content === 'string' ? m.content : '' })
          }
        }
        const legacy = buildDailySignals(messages)
        if (legacy.length > signals.length) signals = legacy
      }

      if (signals.length > 0) {
        const rows = signals.map((s) => ({
          id: `sig:${personId}:${s.date}`, user_id: userId, person_id: personId, date: s.date,
          message_count: s.messageCount, avg_len: s.avgLen, somatic: s.somatic, friction: s.friction,
          withdrawal: s.withdrawal, sensitivity: s.sensitivity, actions: s.actions, composite: s.composite,
          affection: s.affection, positivity_ratio: s.positivityRatio,
          updated_at: new Date().toISOString(),
        }))
        await supabase.from('person_daily_signals').upsert(rows, { onConflict: 'id' })
      }
    }
    if (signals.length < 8) {
      return errorJson(422, 'Poca data para el forecast', 'Necesito varios meses de mensajes con fecha. Subí (o resubí) la conversación de esta persona para llenar el sustrato.')
    }

    // 3) Anclas = person_cycles (bleeding → period_start, pms → pms).
    const { data: cycles } = await supabase
      .from('person_cycles').select('date, phase')
      .eq('user_id', userId).eq('person_id', personId).limit(300)
    const anchors: CycleAnchor[] = ((cycles ?? []) as { date: string; phase: string }[])
      .map((c) => ({ date: c.date, type: c.phase === 'bleeding' ? 'period_start' : c.phase === 'pms' ? 'pms' : 'other' as CycleAnchor['type'] }))
      .filter((a) => a.type !== 'other')

    // 4) Feedback histórico → pesos por modelo (§17) + delta de confianza.
    let weightBoost: Record<string, number> = {}
    let recal: ReturnType<typeof recalibrate> | null = null
    try {
      const { data: fb } = await supabase
        .from('forecast_feedback')
        .select('label, behavior_forecasts(dominant_models)')
        .eq('user_id', userId).eq('person_id', personId).limit(200)
      const rows = (fb ?? []) as { label: FeedbackLabel | null; behavior_forecasts?: { dominant_models?: string[] } | null }[]
      const labels = rows.map((r) => r.label).filter((l): l is FeedbackLabel => !!l)
      recal = recalibrate(labels)
      weightBoost = modelWeights(rows.filter((r) => r.label).map((r) => ({ label: r.label as FeedbackLabel, models: r.behavior_forecasts?.dominant_models ?? [] })))
    } catch { /* best-effort: sin feedback aún */ }

    // 5) Correr el ensamble (con pesos aprendidos).
    const forecast = runForecast({ signals, anchors, now: new Date(), weightBoost })
    if (!forecast) return errorJson(422, 'No se pudo estimar', 'La serie no alcanza para un forecast confiable todavía.')
    if (recal) {
      if (recal.confidenceDelta !== 0) forecast.confidence.score = Math.round(Math.max(0, Math.min(1, forecast.confidence.score + recal.confidenceDelta)) * 100) / 100
      ;(forecast as unknown as Record<string, unknown>).recalibration = recal
    }

    // Afecto expresado (IAE): dimensión APARTE del compuesto conductual. Se computa
    // y persiste por día pero el motor la ignora → sin esto no llegaba al usuario.
    // Viaja en `result` para que GET/POST la devuelvan. Disparador, no veredicto.
    const affection = summarizeAffection(signals)
    if (affection) (forecast as unknown as Record<string, unknown>).affection = affection

    // 5) Persistir el resultado.
    const mw = forecast.mainWindow, ew = forecast.extendedWindow
    const { data: inserted, error } = await supabase.from('behavior_forecasts').insert({
      user_id: userId, person_id: personId, mode: forecast.mode, center_date: forecast.centerDate,
      main_window_start: mw?.start ?? null, main_window_end: mw?.end ?? null,
      extended_window_start: ew?.start ?? null, extended_window_end: ew?.end ?? null,
      period_days: forecast.periodDays, confidence_label: forecast.confidence.label,
      confidence_score: forecast.confidence.score, dominant_models: forecast.dominantModels,
      interpretation: forecast.interpretation, result: forecast,
    }).select(FORECAST_COLS).maybeSingle()
    if (error) return errorJson(500, 'No se pudo guardar el forecast', error.message.slice(0, 200))

    return NextResponse.json({ forecast: inserted, coverage: forecast.coverage })
  } catch (e) {
    reportApiError(e, { route: 'forecast' })
    return errorJson(500, 'Falló el forecast', (e instanceof Error ? e.message : String(e)).slice(0, 200))
  }
}
