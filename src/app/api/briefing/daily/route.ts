// SIR V2 — POST /api/briefing/daily (Fase 5: briefing diario)
//
// Briefing EFÍMERO (no se persiste) de "hoy" sobre el estado actual del
// usuario. Gather server-side de objetivos activos + señales sin resolver +
// person_logs/observations recientes + fase lunar -> Anthropic Sonnet 4.5.
//
// Response 200: { briefing: string }
// 422 si no hay contexto suficiente; 500 si falta ANTHROPIC_API_KEY (ya en prod).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { moonPhase } from '@/lib/lunar/phase'
import { cyclePhase } from '@/lib/ciclo/phase'
import {
  DAILY_BRIEFING_SYSTEM_PROMPT,
  buildDailyInput,
  type DailyGoalLite,
  type DailySignalLite,
  type DailyLogStat,
  type DailyObservationLite,
  type DailyMomentLite,
  type DailyCycleLite,
} from '@/lib/daily-briefing/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const DAY_MS = 86_400_000
const RECENT_DAYS = 3

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response
  const userId = authData.user.id

  const recentIso = new Date(Date.now() - RECENT_DAYS * DAY_MS).toISOString()

  const [goalsRes, signalsRes, logsRes, obsRes, momentsRes, peopleRes] = await Promise.all([
    supabase
      .from('goals')
      .select('title, priority, progress, next_action, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(10),
    supabase
      .from('signals')
      .select('content, urgency, suggested_action, resolved')
      .eq('user_id', userId)
      .eq('resolved', false)
      .limit(10),
    supabase
      .from('person_logs')
      .select('kind, value, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', recentIso)
      .limit(200),
    supabase
      .from('observations')
      .select('capture_type, data, observed_at')
      .eq('user_id', userId)
      .eq('is_obsolete', false)
      .gte('observed_at', recentIso)
      .order('observed_at', { ascending: false })
      .limit(50),
    supabase
      .from('relationship_moments')
      .select('person_id, title, occurred_on, follow_up_on, status')
      .eq('user_id', userId)
      .eq('status', 'abierto')
      .limit(50),
    supabase
      .from('people')
      .select('id, name, cycle_start_date, cycle_length_days, importance_score')
      .eq('user_id', userId)
      .limit(2000),
  ])

  if (goalsRes.error || signalsRes.error || logsRes.error || obsRes.error) {
    return errorJson(
      500,
      'No se pudo leer el contexto',
      goalsRes.error?.message ?? signalsRes.error?.message ?? logsRes.error?.message ?? obsRes.error?.message,
    )
  }

  const goalRows = (goalsRes.data ?? []) as Array<{ title: string; priority: string; progress: number; next_action: string | null }>
  const signalRows = (signalsRes.data ?? []) as Array<{ content: string; urgency: string; suggested_action: string | null }>
  const logRows = (logsRes.data ?? []) as Array<{ kind: string; value: number; logged_at: string }>
  const obsRows = (obsRes.data ?? []) as Array<{ capture_type: string; data: Record<string, unknown> | null; observed_at: string }>
  const momentRows = (momentsRes?.data ?? []) as Array<{ person_id: string; title: string; occurred_on: string | null; follow_up_on: string | null }>

  if (goalRows.length === 0 && signalRows.length === 0 && logRows.length === 0 && obsRows.length === 0 && momentRows.length === 0) {
    return errorJson(
      422,
      'Sin contexto para un briefing',
      'No hay objetivos activos, señales, registros ni interacciones recientes. Registrá algo y reintentá.',
    )
  }

  const goals: DailyGoalLite[] = goalRows.map((g) => ({
    title: g.title,
    priority: g.priority,
    progress: Number(g.progress) || 0,
    nextAction: g.next_action && g.next_action.trim() ? g.next_action : null,
  }))
  const signals: DailySignalLite[] = signalRows.map((s) => ({
    content: s.content,
    urgency: s.urgency,
    suggestedAction: s.suggested_action && s.suggested_action.trim() ? s.suggested_action : null,
  }))

  const byKind = new Map<string, { count: number; sum: number }>()
  for (const l of logRows) {
    const e = byKind.get(l.kind) ?? { count: 0, sum: 0 }
    e.count += 1
    e.sum += Number(l.value) || 0
    byKind.set(l.kind, e)
  }
  const logStats: DailyLogStat[] = [...byKind.entries()].map(([kind, e]) => ({
    kind,
    count: e.count,
    avg: e.count ? e.sum / e.count : 0,
  }))

  const observations: DailyObservationLite[] = obsRows.map((o) => ({
    date: (o.observed_at ?? '').slice(0, 10),
    type: o.capture_type,
    summary: o.data && typeof o.data.summary === 'string' ? (o.data.summary as string) : null,
  }))

  // Decisiones / momentos abiertos (open loops). Best-effort.
  const nameById = new Map<string, string>()
  for (const p of ((peopleRes?.data ?? []) as Array<{ id: string; name: string }>)) nameById.set(p.id, p.name)
  const todayKey = new Date().toISOString().slice(0, 10)
  const moments: DailyMomentLite[] = momentRows.map((m) => {
    const fol = (m.follow_up_on || '').slice(0, 10)
    let due = 'abierto'
    if (fol) due = fol < todayKey ? 'vencido' : fol === todayKey ? 'hoy' : 'proximo'
    return { person: nameById.get(m.person_id) || 'alguien', title: (m.title || '').slice(0, 160), due }
  })

  // Ciclo de vínculos CERCANOS (importance >= 6) con dato cargado. Solo
  // surfaceamos cuando es accionable: cerca del próximo período (<=4 días) o en
  // fase menstrual. Anticipación empática, no médico (el prompt lo encuadra).
  const peopleRows = (peopleRes?.data ?? []) as Array<{ name: string; cycle_start_date: string | null; cycle_length_days: number | null; importance_score: number | null }>
  const cycles: DailyCycleLite[] = []
  for (const p of peopleRows) {
    if (!p.cycle_start_date) continue
    if ((Number(p.importance_score) || 0) < 6) continue
    const ph = cyclePhase(p.cycle_start_date, Number(p.cycle_length_days) || 28)
    if (!ph) continue
    if (ph.daysUntilNextPeriod <= 4 || ph.phase === 'menstrual') {
      cycles.push({ person: p.name, phase: ph.label, daysUntilNextPeriod: ph.daysUntilNextPeriod })
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })

  const today = new Date().toISOString().slice(0, 10)
  const lunarPhase = moonPhase(new Date()).label

  let text = ''
  try {
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 700,
      system: DAILY_BRIEFING_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildDailyInput({ today, lunarPhase, goals, signals, logStats, observations, moments, cycles }) },
      ],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
  } catch (e) {
    reportApiError(e)
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo de briefing', m.slice(0, 300))
  }
  if (!text) return errorJson(502, 'El modelo devolvió un briefing vacío')

  return NextResponse.json({ briefing: text }, { status: 200 })
}
