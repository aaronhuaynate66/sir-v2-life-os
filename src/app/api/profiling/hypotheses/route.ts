// SIR V2 — POST /api/profiling/hypotheses  (19·M2: modo "Explorar hipótesis")
//
// Recibe { personId, concern }. Carga persona + memorias VISIBLES + notas de
// tono, arma el contexto y pide a Sonnet hipótesis que COMPITEN sobre lo que a
// Aaron le preocupa — con guardrails duros (no diagnóstico, cuidar/protegerte,
// peligro real → profesional). Session-auth, rate-limit 'generation'. NO cachea
// (cada preocupación es una exploración deliberada). NO escribe nada.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { getLogsForPerson } from '@/lib/person-logs/fetch'
import {
  HYPOTHESES_SYSTEM_PROMPT, buildHypothesesUserContent, parseHypothesesJson, type HypothesesContext,
} from '@/lib/profiling/hypothesesPrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 40

const MODEL_ID = 'claude-sonnet-4-5'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  const userId = auth.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  let body: { personId?: unknown; concern?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  const concern = typeof body.concern === 'string' ? body.concern.trim().slice(0, 800) : ''
  if (!personId) return errorJson(400, 'Falta la persona')
  if (!concern) return errorJson(400, 'Contame qué te preocupa')

  const { data: person } = await supabase
    .from('people')
    .select('id, name, relationship, ambito')
    .eq('user_id', userId).eq('id', personId).maybeSingle()
  if (!person) return errorJson(404, 'No encontré esa persona')

  let memories: string[] = []
  let interactionNotes: string[] = []
  try {
    const mems = await getMemoriesForPerson(supabase, userId, personId, { limit: 20 })
    memories = mems.map((m) => (m.content ?? '').trim()).filter(Boolean)
    const logs = await getLogsForPerson(supabase, userId, personId, { kind: 'interaction', limit: 16 })
    interactionNotes = logs.filter((l) => l.note && l.note.trim()).map((l) => `tono ${l.value}/5: ${l.note!.trim()}`)
  } catch (e) { reportApiError(e, { route: 'profiling/hypotheses' }) }

  const ctx: HypothesesContext = {
    personName: (person.name as string) ?? 'esa persona',
    relationship: (person.relationship as string) ?? undefined,
    ambito: (person.ambito as string) ?? undefined,
    memories,
    interactionNotes,
  }
  const user = buildHypothesesUserContent(ctx, concern)

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })

  async function call(extra = ''): Promise<string> {
    const msg = await client.messages.create({
      model: MODEL_ID, max_tokens: 1200,
      system: extra ? `${HYPOTHESES_SYSTEM_PROMPT}\n\n${extra}` : HYPOTHESES_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    return block && block.type === 'text' ? block.text : ''
  }

  let raw = ''
  try { raw = await call() } catch (e) {
    reportApiError(e, { route: 'profiling/hypotheses' })
    return errorJson(502, 'Falló la llamada a Claude', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let result = parseHypothesesJson(raw)
  if (!result) {
    try { result = parseHypothesesJson(await call('CRÍTICO: devolvé SOLO el JSON, empezando con { y terminando con }.')) } catch { result = null }
  }
  if (!result) return errorJson(502, 'Claude devolvió formato inválido')

  return NextResponse.json({ result })
}
