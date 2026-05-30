// SIR V2 — POST /api/longitudinal/weekly (Fase 3c)
//
// Genera (y cachea en longitudinal_summaries) un resumen SEMANAL accionable
// con patrones observados sobre el historial del usuario: person_logs +
// observations (curadas) + memories, en la ventana de los últimos N días.
//
// Body JSON (opcional): { days?: number }  (default 7, máx 31)
// Response 201: { summary: LongitudinalSummary }
//
// Flujo (mismo scaffolding que /api/person-synthesis):
//   1. Auth.
//   2. Fetch user-wide en la ventana (person_logs / observations / memories).
//   3. 422 si no hay NADA en la ventana.
//   4. Anthropic Sonnet 4.5 (ANTHROPIC_API_KEY, ya en prod). 500 si falta.
//   5. Insert del row + devolver.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { rowToLongitudinalSummary } from '@/lib/longitudinal/fetch'
import { moonPhase } from '@/lib/lunar/phase'
import { cyclePhase } from '@/lib/ciclo/phase'
import {
  WEEKLY_SUMMARY_SYSTEM_PROMPT,
  buildWeeklyInput,
  type WeeklyLogStat,
  type WeeklyObservationLite,
  type WeeklyMemoryLite,
  type WeeklyLunarStat,
  type WeeklyCycleNote,
} from '@/lib/longitudinal/prompt'
import type { LongitudinalSummary } from '@/lib/longitudinal/types'

// Estados 1-5 que tiene sentido cruzar con fase lunar / ciclo.
const STATE_KINDS: ReadonlySet<string> = new Set(['mood', 'energy', 'sleep', 'pain'])
const DAY_MS = 86_400_000

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const ROW_LIMIT = 200

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let days = 7
  try {
    const body = (await req.json()) as { days?: unknown }
    if (typeof body?.days === 'number' && Number.isFinite(body.days)) {
      days = Math.max(1, Math.min(31, Math.floor(body.days)))
    }
  } catch {
    /* sin body -> default 7 */
  }

  // Ventana [start, end] en fechas UTC date-only.
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - (days - 1))
  const periodStart = start.toISOString().slice(0, 10)
  const periodEnd = end.toISOString().slice(0, 10)
  const startTsIso = start.toISOString()

  // Fetch user-wide en la ventana (RLS + user_id explicito).
  const [logsRes, obsRes, memRes] = await Promise.all([
    supabase
      .from('person_logs')
      .select('kind, value, logged_at, person_id')
      .eq('user_id', userId)
      .gte('logged_at', startTsIso)
      .order('logged_at', { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from('observations')
      .select('capture_type, data, observed_at')
      .eq('user_id', userId)
      .eq('is_obsolete', false)
      .gte('observed_at', startTsIso)
      .order('observed_at', { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from('memories')
      .select('type, content, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', startTsIso)
      .order('occurred_at', { ascending: false })
      .limit(ROW_LIMIT),
  ])

  if (logsRes.error) return errorJson(500, 'No se pudieron leer los registros', logsRes.error.message)
  if (obsRes.error) return errorJson(500, 'No se pudieron leer las observaciones', obsRes.error.message)
  if (memRes.error) return errorJson(500, 'No se pudieron leer las memorias', memRes.error.message)

  const logRows = (logsRes.data ?? []) as Array<{ kind: string; value: number; logged_at: string; person_id: string | null }>
  const obsRows = (obsRes.data ?? []) as Array<{ capture_type: string; data: Record<string, unknown> | null; observed_at: string }>
  const memRows = (memRes.data ?? []) as Array<{ type: string; content: string; occurred_at: string }>

  if (logRows.length === 0 && obsRows.length === 0 && memRows.length === 0) {
    return errorJson(
      422,
      'Sin actividad en la ventana',
      `No hay registros, conversaciones ni memorias en los últimos ${days} días. Registrá algo y reintentá.`,
    )
  }

  // Aggregate logs por kind (count + avg).
  const byKind = new Map<string, { count: number; sum: number }>()
  for (const l of logRows) {
    const e = byKind.get(l.kind) ?? { count: 0, sum: 0 }
    e.count += 1
    e.sum += Number(l.value) || 0
    byKind.set(l.kind, e)
  }
  const logStats: WeeklyLogStat[] = [...byKind.entries()].map(([kind, e]) => ({
    kind,
    count: e.count,
    avg: e.count ? e.sum / e.count : 0,
  }))

  const observations: WeeklyObservationLite[] = obsRows.map((o) => ({
    date: (o.observed_at ?? '').slice(0, 10),
    type: o.capture_type,
    summary: o.data && typeof o.data.summary === 'string' ? (o.data.summary as string) : null,
  }))
  const memories: WeeklyMemoryLite[] = memRows.map((m) => ({
    date: (m.occurred_at ?? '').slice(0, 10),
    type: m.type,
    content: m.content,
  }))

  const sourceCounts = { logs: logRows.length, observations: obsRows.length, memories: memRows.length }

  // ─── Correlación lunar/ciclo (sub-item 3c) ──────────────────────────
  // Fases lunares que atravesó la semana (una muestra por día del rango).
  const lunarPhasesInWeek: string[] = []
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const label = moonPhase(new Date(t)).label
    if (!lunarPhasesInWeek.includes(label)) lunarPhasesInWeek.push(label)
  }

  // Estado promedio por (fase lunar × kind) — solo estados 1-5.
  const lunarAgg = new Map<string, { count: number; sum: number }>() // key = `${phase}|${kind}`
  for (const l of logRows) {
    if (!STATE_KINDS.has(l.kind)) continue
    const phase = moonPhase(new Date(l.logged_at)).label
    const key = `${phase}|${l.kind}`
    const e = lunarAgg.get(key) ?? { count: 0, sum: 0 }
    e.count += 1
    e.sum += Number(l.value) || 0
    lunarAgg.set(key, e)
  }
  const lunarStats: WeeklyLunarStat[] = [...lunarAgg.entries()].map(([key, e]) => {
    const [phase, kind] = key.split('|')
    return { phase, kind, count: e.count, avg: e.count ? e.sum / e.count : 0 }
  })

  // Notas de ciclo: personas con cycle_start_date que registraron algo en
  // la ventana. Fase computada como del fin de semana (period_end).
  const cycleNotes: WeeklyCycleNote[] = []
  const personIdsWithLogs = new Set(logRows.map((l) => l.person_id).filter((p): p is string => !!p))
  if (personIdsWithLogs.size > 0) {
    const { data: peopleRows } = await supabase
      .from('people')
      .select('id, name, cycle_start_date, cycle_length_days')
      .eq('user_id', userId)
      .not('cycle_start_date', 'is', null)
      .in('id', [...personIdsWithLogs])
    for (const p of (peopleRows ?? []) as Array<{
      id: string; name: string; cycle_start_date: string | null; cycle_length_days: number | null
    }>) {
      if (!p.cycle_start_date) continue
      const phase = cyclePhase(p.cycle_start_date, p.cycle_length_days ?? 28, end)
      if (!phase) continue
      const logCount = logRows.filter((l) => l.person_id === p.id).length
      cycleNotes.push({ person: p.name, phase: phase.label, cycleDay: phase.cycleDay, logCount })
    }
  }

  // LLM.
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })

  let text = ''
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  try {
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 900,
      system: WEEKLY_SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildWeeklyInput({
            periodStart,
            periodEnd,
            logStats,
            observations,
            memories,
            lunarPhasesInWeek,
            lunarStats,
            cycleNotes,
          }),
        },
      ],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
    inputTokens = msg.usage?.input_tokens ?? null
    outputTokens = msg.usage?.output_tokens ?? null
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo de resumen', m.slice(0, 300))
  }
  if (!text) return errorJson(502, 'El modelo devolvió un resumen vacío')

  const { data: inserted, error: insErr } = await supabase
    .from('longitudinal_summaries')
    .insert({
      user_id: userId,
      period_kind: 'weekly',
      period_start: periodStart,
      period_end: periodEnd,
      summary_text: text,
      source_counts: sourceCounts,
      model_used: MODEL_ID,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    })
    .select(
      'id, period_kind, period_start, period_end, summary_text, source_counts, model_used, input_tokens, output_tokens, generated_at',
    )
    .single()

  if (insErr || !inserted) {
    return errorJson(500, 'No se pudo guardar el resumen', insErr?.message ?? 'sin data')
  }

  const summary: LongitudinalSummary = rowToLongitudinalSummary(inserted as Record<string, unknown>)
  return NextResponse.json({ summary }, { status: 201 })
}
