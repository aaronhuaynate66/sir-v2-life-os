// SIR V2 — POST /api/influence/rehearse  (16·M4: Sala de ensayo — caminos al objetivo)
//
// Recibe { personId, objective }. Carga a la persona (incl. ámbito, que decide el
// registro afectivo vs profesional) + sus memorias VISIBLES (getMemoriesForPerson
// ya excluye lo privado), arma el contexto y pide a Sonnet los caminos/objeciones/
// acciones como HIPÓTESIS (ensayo, no predicción), con guardrail ético. NO escribe.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { REHEARSE_SYSTEM_PROMPT, buildRehearseUserContent, parseRehearseJson, type RehearseContext } from '@/lib/influence/rehearsePrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

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

  let body: { personId?: unknown; objective?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  const objective = typeof body.objective === 'string' ? body.objective.trim().slice(0, 600) : ''
  if (!personId) return errorJson(400, 'Falta la persona')
  if (!objective) return errorJson(400, 'Contame qué querés lograr')

  const { data: person } = await supabase
    .from('people')
    .select('id, name, title, organization, relationship, ambito')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (!person) return errorJson(404, 'No encontré esa persona')

  let memories: string[] = []
  try {
    const rows = await getMemoriesForPerson(supabase, userId, personId, { limit: 24 })
    memories = rows.map((m) => (m.content ?? '').trim()).filter(Boolean)
  } catch (e) { reportApiError(e, { route: 'influence/rehearse' }) }

  const ctx: RehearseContext = {
    personName: (person.name as string) ?? 'esa persona',
    role: (person.title as string) ?? undefined,
    organization: (person.organization as string) ?? undefined,
    relationship: (person.relationship as string) ?? undefined,
    ambito: (person.ambito as string) ?? undefined,
    memories,
  }
  const user = buildRehearseUserContent(ctx, objective)

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })

  async function call(extra = ''): Promise<string> {
    const msg = await client.messages.create({
      model: MODEL_ID, max_tokens: 1400,
      system: extra ? `${REHEARSE_SYSTEM_PROMPT}\n\n${extra}` : REHEARSE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    return block && block.type === 'text' ? block.text : ''
  }

  let raw = ''
  try {
    raw = await call()
  } catch (e) {
    reportApiError(e, { route: 'influence/rehearse' })
    return errorJson(502, 'Falló la llamada a Claude', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let result = parseRehearseJson(raw)
  if (!result) {
    try { result = parseRehearseJson(await call('CRÍTICO: devolvé SOLO el JSON, empezando con { y terminando con }.')) } catch { result = null }
  }
  if (!result) return errorJson(502, 'Claude devolvió formato inválido')

  return NextResponse.json({ result, person: { name: ctx.personName, hadContext: memories.length > 0 } })
}
