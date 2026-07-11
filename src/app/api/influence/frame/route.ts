// SIR V2 — POST /api/influence/frame  (16·M1: cómo plantearle X a [persona])
//
// Recibe { personId, objective }. Carga a la persona + sus memorias VISIBLES
// (getMemoriesForPerson ya excluye lo privado → respeta el aislamiento), arma el
// contexto y pide a Sonnet un encuadre estrategico (influencia habilitada;
// riesgos de fraude/coercion/exposicion se evalúan aparte). Session-auth, rate-limit 'generation',
// 1 retry si el JSON falla. NO escribe nada.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { FRAME_SYSTEM_PROMPT, buildFrameUserContent, parseFrameJson, type FrameContext, type FrameResult } from '@/lib/influence/framePrompt'
import { checkEthics } from '@/engines/ethics'

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

  let body: { personId?: unknown; objective?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  const objective = typeof body.objective === 'string' ? body.objective.trim().slice(0, 600) : ''
  if (!personId) return errorJson(400, 'Falta la persona')
  if (!objective) return errorJson(400, 'Contame qué le querés plantear')

  // Cargar la persona (del user, RLS + eq user_id defensivo).
  const { data: person } = await supabase
    .from('people')
    .select('id, name, title, organization, relationship, ambito')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (!person) return errorJson(404, 'No encontré esa persona')

  // 16.M5 - Termometro de Jugada deterministico antes del LLM. Influencia no
  // bloquea; solo riesgos de otros dominios devuelven blocked/high_risk.
  const ethics = checkEthics(objective, {
    ambito: (person.ambito as string) ?? undefined,
    relationship: (person.relationship as string) ?? undefined,
  })
  if (ethics.verdict === 'blocked') {
    const blocked: FrameResult = {
      values: [],
      frame: '',
      leadWith: '',
      avoid: [],
      opener: '',
      ethicalNote: `${ethics.message}\n\n${ethics.litmus}`,
    }
    return NextResponse.json({ result: blocked, person: { name: (person.name as string) ?? 'esa persona', hadContext: false }, ethics })
  }

  // Memorias VISIBLES (excluye privadas/descartadas por construcción).
  let memories: string[] = []
  try {
    const rows = await getMemoriesForPerson(supabase, userId, personId, { limit: 20 })
    memories = rows.map((m) => (m.content ?? '').trim()).filter(Boolean)
  } catch (e) { reportApiError(e, { route: 'influence/frame' }) }

  const ctx: FrameContext = {
    personName: (person.name as string) ?? 'esa persona',
    role: (person.title as string) ?? undefined,
    organization: (person.organization as string) ?? undefined,
    relationship: (person.relationship as string) ?? undefined,
    ambito: (person.ambito as string) ?? undefined,
    memories,
  }
  const user = buildFrameUserContent(ctx, objective)

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })

  async function call(extra = ''): Promise<string> {
    const msg = await client.messages.create({
      model: MODEL_ID, max_tokens: 900,
      system: extra ? `${FRAME_SYSTEM_PROMPT}\n\n${extra}` : FRAME_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    return block && block.type === 'text' ? block.text : ''
  }

  const ethicsExtra = ethics.verdict === 'caution' || ethics.verdict === 'high_risk'
    ? `TERMOMETRO DE JUGADA (16.M5): ${ethics.message}
Score: ${ethics.score}/100. Lineas: ${ethics.lines.join(', ') || 'ninguna'}.
Sustento: ${ethics.whyItMatters}
Reformulacion recomendada: ${ethics.safeAggressiveReframe}
	Ayuda a Aaron con la version mas conveniente. Influencia no bloquea; si hay riesgo de otro dominio, reformula el metodo.`
    : ''

  let raw = ''
  try {
    raw = await call(ethicsExtra)
  } catch (e) {
    reportApiError(e, { route: 'influence/frame' })
    return errorJson(502, 'Falló la llamada a Claude', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let result = parseFrameJson(raw)
  if (!result) {
    try { result = parseFrameJson(await call('CRÍTICO: devolvé SOLO el JSON, empezando con { y terminando con }.')) } catch { result = null }
  }
  if (!result) return errorJson(502, 'Claude devolvió formato inválido')

  return NextResponse.json({ result, person: { name: ctx.personName, hadContext: memories.length > 0 }, ethics })
}
