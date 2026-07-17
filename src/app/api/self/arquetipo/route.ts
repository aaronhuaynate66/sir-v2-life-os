// SIR V2 — POST /api/self/arquetipo (Motor #4 · Espejo de narrativa/arquetipo).
// Mismo patrón que /api/self/rumbo: recibe los hitos REALES (client) y pide al
// LLM que nombre el arquetipo vivido + su tensión + la pregunta de autoría.
import { NextResponse, type NextRequest } from 'next/server'
import { complete, LlmError } from '@/lib/llm'
import { reportApiError } from '@/lib/observability/reportApiError'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { ARQUETIPO_SYSTEM_PROMPT, buildArquetipoInput, parseArquetipo, type ArquetipoMilestoneInput } from '@/lib/self/arquetipoPrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
const MAX_MILESTONES = 24

function sanitize(raw: unknown): ArquetipoMilestoneInput[] {
  if (!Array.isArray(raw)) return []
  const out: ArquetipoMilestoneInput[] = []
  for (const m of raw) {
    if (typeof m !== 'object' || m === null) continue
    const o = m as Record<string, unknown>
    const label = typeof o.label === 'string' ? o.label.trim().slice(0, 200) : ''
    const date = typeof o.date === 'string' ? o.date.trim() : ''
    const kind = typeof o.kind === 'string' ? o.kind.trim() : ''
    if (!label || !date) continue
    out.push({ label, date, kind })
    if (out.length >= MAX_MILESTONES) break
  }
  return out
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const rl = await enforceRateLimit(supabase, auth.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const milestones = sanitize(body.milestones)
  const anchor = typeof body.anchor === 'string' ? body.anchor.trim().slice(0, 200) : null
  const identity = typeof body.identity === 'string' ? body.identity.trim().slice(0, 300) : null
  if (milestones.length < 2) return NextResponse.json({ error: 'Hilo insuficiente', detail: 'Necesito un par de hitos para leer tu arquetipo. Se teje a medida que pones y mueves objetivos.' }, { status: 422 })
  try {
    const res = await complete({
      task: 'synthesis', sensitivity: 'self',
      system: ARQUETIPO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildArquetipoInput(milestones, anchor, identity) }],
      maxTokens: 500,
    }, { supabase, userId: auth.user.id })
    const parsed = parseArquetipo(res.text)
    if (!parsed) return NextResponse.json({ error: 'Respuesta vacía del modelo' }, { status: 502 })
    return NextResponse.json(parsed, { status: 200 })
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') return NextResponse.json({ error: 'No disponible', detail: 'No hay proveedor LLM configurado.' }, { status: 503 })
    return NextResponse.json({ error: 'No se pudo leer el arquetipo', detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
