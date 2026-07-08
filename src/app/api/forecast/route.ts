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
import { runForecast } from '@/lib/forecast-conductual/engine'
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
    // 1) Señales diarias: PRIMERO de person_daily_signals (cobertura completa,
    // computada al importar el export entero). Fallback: derivarlas de la MUESTRA
    // reciente de rawMessages (span corto) y persistirlas.
    let signals: DailySignal[] = []
    const { data: sigRows } = await supabase
      .from('person_daily_signals')
      .select('date, message_count, avg_len, somatic, friction, withdrawal, sensitivity, actions, composite')
      .eq('user_id', userId).eq('person_id', personId)
      .order('date', { ascending: true }).limit(2000)
    if (sigRows && sigRows.length >= 10) {
      signals = (sigRows as Record<string, unknown>[]).map((r) => ({
        date: r.date as string, messageCount: Number(r.message_count) || 0, avgLen: Number(r.avg_len) || 0,
        somatic: Number(r.somatic) || 0, friction: Number(r.friction) || 0, withdrawal: Number(r.withdrawal) || 0,
        sensitivity: Number(r.sensitivity) || 0, actions: Number(r.actions) || 0, composite: Number(r.composite) || 0,
      }))
    } else {
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
      signals = buildDailySignals(messages)
      if (signals.length > 0) {
        const rows = signals.map((s) => ({
          id: `sig:${personId}:${s.date}`, user_id: userId, person_id: personId, date: s.date,
          message_count: s.messageCount, avg_len: s.avgLen, somatic: s.somatic, friction: s.friction,
          withdrawal: s.withdrawal, sensitivity: s.sensitivity, actions: s.actions, composite: s.composite,
          updated_at: new Date().toISOString(),
        }))
        await supabase.from('person_daily_signals').upsert(rows, { onConflict: 'id' })
      }
    }
    if (signals.length < 8) {
      return errorJson(422, 'Poca data para el forecast', 'Importá el export completo de esta persona (necesito varios meses de mensajes con fecha, no solo lo reciente).')
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
