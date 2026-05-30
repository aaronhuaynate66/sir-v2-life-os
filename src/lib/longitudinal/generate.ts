// SIR V2 — Generación del resumen semanal (Fase 3c), reutilizable.
//
// Núcleo compartido por:
//   - POST /api/longitudinal/weekly  (on-demand, cliente RLS-scoped)
//   - POST /api/cron/weekly-summary  (cron, service-role, por usuario)
//
// Siempre filtra por user_id EXPLICITO, así funciona igual con un cliente
// RLS (datos propios) o service-role (cualquier user, acotado a mano).

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

import { rowToLongitudinalSummary } from './fetch'
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
} from './prompt'
import type { LongitudinalSummary } from './types'

export const WEEKLY_MODEL_ID = 'claude-sonnet-4-5-20250929'
const ROW_LIMIT = 200
const DAY_MS = 86_400_000
const STATE_KINDS: ReadonlySet<string> = new Set(['mood', 'energy', 'sleep', 'pain'])

export type GenerateStatus =
  | 'ok'
  | 'empty'
  | 'skipped_exists'
  | 'no_api_key'
  | 'read_error'
  | 'llm_error'
  | 'insert_error'

export interface GenerateResult {
  status: GenerateStatus
  summary?: LongitudinalSummary
  detail?: string
}

export interface GenerateOptions {
  /** Ventana en días (default 7, clamp 1-31). */
  days?: number
  /** Si ya existe un resumen weekly con el mismo period_end, no regenerar.
   *  El cron lo usa para no duplicar; el botón on-demand lo deja en false. */
  skipIfExists?: boolean
}

export async function generateWeeklySummaryForUser(
  supabase: SupabaseClient,
  userId: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const days = Math.max(1, Math.min(31, Math.floor(opts.days ?? 7)))

  // Ventana [start, end] en fechas UTC date-only.
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - (days - 1))
  const periodStart = start.toISOString().slice(0, 10)
  const periodEnd = end.toISOString().slice(0, 10)
  const startTsIso = start.toISOString()

  if (opts.skipIfExists) {
    const { data: existing } = await supabase
      .from('longitudinal_summaries')
      .select('id')
      .eq('user_id', userId)
      .eq('period_kind', 'weekly')
      .eq('period_end', periodEnd)
      .limit(1)
      .maybeSingle()
    if (existing) return { status: 'skipped_exists' }
  }

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

  if (logsRes.error || obsRes.error || memRes.error) {
    return {
      status: 'read_error',
      detail: logsRes.error?.message ?? obsRes.error?.message ?? memRes.error?.message,
    }
  }

  const logRows = (logsRes.data ?? []) as Array<{ kind: string; value: number; logged_at: string; person_id: string | null }>
  const obsRows = (obsRes.data ?? []) as Array<{ capture_type: string; data: Record<string, unknown> | null; observed_at: string }>
  const memRows = (memRes.data ?? []) as Array<{ type: string; content: string; occurred_at: string }>

  if (logRows.length === 0 && obsRows.length === 0 && memRows.length === 0) {
    return { status: 'empty', detail: `Sin actividad en los últimos ${days} días.` }
  }

  // Stats de logs por kind.
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

  // Correlación lunar/ciclo.
  const lunarPhasesInWeek: string[] = []
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const label = moonPhase(new Date(t)).label
    if (!lunarPhasesInWeek.includes(label)) lunarPhasesInWeek.push(label)
  }
  const lunarAgg = new Map<string, { count: number; sum: number }>()
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

  const sourceCounts = { logs: logRows.length, observations: obsRows.length, memories: memRows.length }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: 'no_api_key', detail: 'ANTHROPIC_API_KEY no configurada en el server' }
  }
  const client = new Anthropic({ maxRetries: 2 })

  let text = ''
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  try {
    const msg = await client.messages.create({
      model: WEEKLY_MODEL_ID,
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
    return { status: 'llm_error', detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }
  }
  if (!text) return { status: 'llm_error', detail: 'El modelo devolvió un resumen vacío' }

  const { data: inserted, error: insErr } = await supabase
    .from('longitudinal_summaries')
    .insert({
      user_id: userId,
      period_kind: 'weekly',
      period_start: periodStart,
      period_end: periodEnd,
      summary_text: text,
      source_counts: sourceCounts,
      model_used: WEEKLY_MODEL_ID,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    })
    .select(
      'id, period_kind, period_start, period_end, summary_text, source_counts, model_used, input_tokens, output_tokens, generated_at',
    )
    .single()

  if (insErr || !inserted) {
    return { status: 'insert_error', detail: insErr?.message ?? 'sin data' }
  }

  return { status: 'ok', summary: rowToLongitudinalSummary(inserted as Record<string, unknown>) }
}
