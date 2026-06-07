// SIR V2 — /api/horario/brief (Brief del día — /horario Fase 2)
//
// Genera el "Brief del día": un resumen corto y accionable de HOY a partir de
// señales que el CLIENTE ya computó con datos reales (eventos, tareas que vencen
// hoy, huecos libres, fechas que se acercan, relaciones a atender). El modelo
// SÓLO reformula esas señales — no inventa data (mismo contrato que
// alignment/narrative). La capa pura vive en lib/horario/brief.
//
//   GET  ?date=YYYY-MM-DD  → peek del cache del día (sin generar, sin gastar).
//   POST { signals, force } → genera (con cache fail-open por día) y devuelve.
//
// Cache fail-open: si la tabla daily_briefs existe (mig 0062) cacheamos por
// (user, día) e idempotamos; si NO existe, generamos on-demand y seguimos (igual
// que action_suggestions/0048). Sin ANTHROPIC_API_KEY → 503: el brief es
// opcional; el resumen determinístico del cliente se muestra igual.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { extractJsonObject } from '@/lib/objectives/planPrompt'
import {
  BRIEF_SYSTEM_PROMPT,
  buildBriefInput,
  parseBriefJson,
  BRIEF_TASK_CAP,
  BRIEF_GAP_CAP,
  BRIEF_DATE_CAP,
  BRIEF_RELATION_CAP,
  type BriefSignals,
  type BriefResult,
} from '@/lib/horario/brief'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function priorityOf(v: unknown): BriefSignals['tasks'][number]['priority'] {
  return v === 'low' || v === 'med' || v === 'high' ? v : undefined
}
function urgencyOf(v: unknown): BriefSignals['relations'][number]['urgency'] {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'low'
}

/**
 * Sanea las señales recibidas del cliente: clampa conteos, recorta strings y
 * caps de arrays. El cliente es de confianza (mono-usuario autenticado), pero el
 * texto va a un prompt → lo mantenemos acotado y bien tipado.
 */
function sanitizeSignals(raw: unknown): BriefSignals | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const date = str(o.date, 10)
  if (!DATE_RE.test(date)) return null

  const ev = (v: unknown): { title: string; time: string } | undefined => {
    if (typeof v !== 'object' || v === null) return undefined
    const e = v as Record<string, unknown>
    const title = str(e.title, 120)
    if (!title) return undefined
    return { title, time: str(e.time, 5) }
  }

  const s: BriefSignals = {
    date,
    eventCount: num(o.eventCount),
    allDayTitles: arr(o.allDayTitles).map((t) => str(t, 120)).filter(Boolean).slice(0, 6),
    tasksDueCount: num(o.tasksDueCount),
    overdueCount: num(o.overdueCount),
    tasks: arr(o.tasks)
      .map((t) => {
        const x = t as Record<string, unknown>
        const title = str(x?.title, 160)
        if (!title) return null
        return {
          title,
          objective: str(x?.objective, 120),
          overdue: x?.overdue === true,
          priority: priorityOf(x?.priority),
        }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .slice(0, BRIEF_TASK_CAP),
    gaps: arr(o.gaps)
      .map((g) => {
        const x = g as Record<string, unknown>
        return { from: str(x?.from, 5), to: str(x?.to, 5), duration: str(x?.duration, 12), minutes: num(x?.minutes) }
      })
      .filter((g) => g.from && g.to)
      .slice(0, BRIEF_GAP_CAP),
    upcomingDates: arr(o.upcomingDates)
      .map((d) => {
        const x = d as Record<string, unknown>
        const title = str(x?.title, 120)
        if (!title) return null
        return { title, daysUntil: num(x?.daysUntil), nudge: str(x?.nudge, 120) }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .slice(0, BRIEF_DATE_CAP),
    relations: arr(o.relations)
      .map((r) => {
        const x = r as Record<string, unknown>
        const name = str(x?.name, 80)
        if (!name) return null
        return {
          name,
          headline: str(x?.headline, 160),
          urgency: urgencyOf(x?.urgency),
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, BRIEF_RELATION_CAP),
  }

  if (typeof o.overload === 'object' && o.overload !== null) {
    const ol = o.overload as Record<string, unknown>
    const reason = str(ol.reason, 200)
    if (reason) s.overload = { level: str(ol.level, 20), reason }
  }
  const first = ev(o.firstEvent)
  const last = ev(o.lastEvent)
  if (first) s.firstEvent = first
  if (last) s.lastEvent = last

  return s
}

async function readCache(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dateBucket: string,
): Promise<BriefResult | null> {
  try {
    const { data } = await supabase
      .from('daily_briefs')
      .select('brief, focus')
      .eq('user_id', userId)
      .eq('date_bucket', dateBucket)
      .maybeSingle()
    if (data && typeof data.brief === 'string' && data.brief) {
      return { brief: data.brief, focus: typeof data.focus === 'string' ? data.focus : '' }
    }
  } catch {
    /* tabla no aplicada todavía → sin cache */
  }
  return null
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado')

  const date = req.nextUrl.searchParams.get('date') ?? ''
  if (!DATE_RE.test(date)) return errorJson(400, 'date inválida (YYYY-MM-DD)')

  const cached = await readCache(supabase, authData.user.id, date)
  return NextResponse.json(cached ? { ...cached, cached: true } : { brief: null }, { status: 200 })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado')
  const userId = authData.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }

  const signals = sanitizeSignals(body.signals)
  if (!signals) return errorJson(400, 'signals inválidas o sin fecha')
  const force = body.force === true
  const dateBucket = signals.date

  // Cache (fail-open): salvo regeneración explícita.
  if (!force) {
    const cached = await readCache(supabase, userId, dateBucket)
    if (cached) return NextResponse.json({ ...cached, cached: true }, { status: 200 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(
      503,
      'Brief no disponible',
      'Falta ANTHROPIC_API_KEY. El resumen del día se muestra igual sin la narrativa.',
    )
  }

  let result: BriefResult | null = null
  try {
    const client = new Anthropic({ maxRetries: 2 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 350,
      system: BRIEF_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildBriefInput(signals) }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    result = parseBriefJson(text, extractJsonObject)
  } catch (e) {
    reportApiError(e, { route: 'horario/brief' })
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo generar el brief', detail)
  }

  if (!result) return errorJson(502, 'Respuesta vacía del modelo', 'Reintentá en unos segundos.')

  // Cachear (fail-open / idempotente por día).
  try {
    await supabase.from('daily_briefs').upsert(
      {
        user_id: userId,
        date_bucket: dateBucket,
        brief: result.brief,
        focus: result.focus,
      },
      { onConflict: 'user_id,date_bucket' },
    )
  } catch {
    /* sin cache, ya devolvimos el brief igual */
  }

  return NextResponse.json({ ...result, cached: false }, { status: 200 })
}
