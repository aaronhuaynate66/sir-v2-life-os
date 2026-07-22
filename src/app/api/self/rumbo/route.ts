// SIR V2 — POST /api/self/rumbo (Narrative Intelligence Capa 2)
//
// Recibe los HITOS REALES de la trayectoria (buildLifeThread, client-side) y
// pide a Anthropic una reflexión breve y REFLEXIVA sobre el rumbo. El LLM no
// arma el hilo: sólo reformula los hitos provistos. Por eso se apoya en datos,
// no en invención.
//
// < 2 hitos → 422 (no hay hilo que reflexionar). Sin ANTHROPIC_API_KEY → 503
// (la reflexión es opcional; el hilo determinístico se ve igual sin ella).
//
// Body JSON: { milestones: [{ label, date, kind }] }
// Response 200: { insight: string }

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { todayLimaKey } from '@/lib/dates/limaDay'
import {
  RUMBO_NARRATIVE_SYSTEM_PROMPT,
  buildRumboInput,
  parseRumboNarrative,
  type RumboMilestoneInput,
} from '@/lib/self/rumboPrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_MILESTONES = 24
const MAX_LABEL_CHARS = 200

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

function sanitizeMilestones(raw: unknown): RumboMilestoneInput[] {
  if (!Array.isArray(raw)) return []
  const out: RumboMilestoneInput[] = []
  for (const m of raw) {
    if (typeof m !== 'object' || m === null) continue
    const obj = m as Record<string, unknown>
    const label = typeof obj.label === 'string' ? obj.label.trim().slice(0, MAX_LABEL_CHARS) : ''
    const date = typeof obj.date === 'string' ? obj.date.trim() : ''
    const kind = typeof obj.kind === 'string' ? obj.kind.trim() : ''
    if (!label || !date) continue
    out.push({ label, date, kind })
    if (out.length >= MAX_MILESTONES) break
  }
  return out
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Inicia sesión y reintenta.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }

  const milestones = sanitizeMilestones(body.milestones)
  const anchor = typeof body.anchor === 'string' ? body.anchor.trim().slice(0, 200) : null
  const identity = typeof body.identity === 'string' ? body.identity.trim().slice(0, 300) : null
  const trajectory = typeof body.trajectory === 'string' ? body.trajectory.trim().slice(0, 400) : null
  const seasons = typeof body.seasons === 'string' ? body.seasons.trim().slice(0, 500) : null
  const narrativeArc = typeof body.narrativeArc === 'string' ? body.narrativeArc.trim().slice(0, 400) : null
  if (milestones.length < 2) {
    return errorJson(
      422,
      'Hilo insuficiente',
      'Necesito al menos un par de hitos para reflexionar sobre tu rumbo. Se va tejiendo a medida que pones y mueves objetivos.',
    )
  }

  try {
    const res = await complete({
      task: 'synthesis', sensitivity: 'self',
      system: RUMBO_NARRATIVE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildRumboInput(milestones, anchor, identity, trajectory, seasons, narrativeArc) }],
      maxTokens: 400,
    }, { supabase, userId: authData.user.id })
    const insight = parseRumboNarrative(res.text)
    if (!insight) {
      return errorJson(502, 'Respuesta vacía del modelo', 'Reintenta en unos segundos.')
    }

    // Persistir la reflexión: 1 vigente por día (regenerar el mismo día actualiza).
    // Best-effort — si el guardado falla, igual devolvemos la reflexión generada.
    try {
      await supabase
        .from('life_direction_reflections')
        .upsert(
          { user_id: authData.user.id, day_key: todayLimaKey(), insight, anchor, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,day_key' },
        )
    } catch (persistErr) {
      reportApiError(persistErr, { route: 'self/rumbo:persist' })
    }

    return NextResponse.json({ insight }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') {
      return errorJson(503, 'Reflexión no disponible', 'No hay proveedor LLM configurado. El hilo de tu rumbo se ve igual sin la reflexión.')
    }
    const detail = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'No se pudo generar la reflexión', detail)
  }
}

// GET — la reflexión de rumbo persistida más reciente + la anterior (para ver la
// EVOLUCIÓN del rumbo). Sin generar nada: el panel la muestra al cargar sin gastar
// LLM ni exigir que el usuario apriete "Generar". Fail-soft → { latest:null }.
export async function GET() {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado')
  }
  try {
    const { data } = await supabase
      .from('life_direction_reflections')
      .select('day_key, insight, anchor, updated_at')
      .eq('user_id', authData.user.id)
      .order('day_key', { ascending: false })
      .limit(2)
    const rows = (data ?? []) as Array<{ day_key: string; insight: string; anchor: string | null; updated_at: string }>
    return NextResponse.json({ latest: rows[0] ?? null, previous: rows[1] ?? null }, { status: 200 })
  } catch (e) {
    reportApiError(e, { route: 'self/rumbo:get' })
    return NextResponse.json({ latest: null, previous: null }, { status: 200 })
  }
}
