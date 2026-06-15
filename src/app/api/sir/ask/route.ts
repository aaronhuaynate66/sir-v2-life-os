// SIR V2 — POST /api/sir/ask (#86 SIR conversacional · PR1 SOLO LECTURA)
//
// Q&A aterrizado sobre la data de Aaron: resuelve de qué persona(s)/objetivos
// habla la pregunta, junta su contexto real (score, memorias, último contacto,
// objetivos) + memorias por búsqueda semántica, y responde con grounding
// estricto (no inventa). NO escribe nada. Las acciones (crear objetivo,
// registrar interacción) llegan en una fase posterior con confirmación.
//
// Body JSON: { question: string }
// Response 200: { answer: string, sources: { people: string[], memories: number } }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { computeRelationalScore } from '@/lib/people/relationalScore'
import { embedText, toPgVector } from '@/lib/embeddings/client'
import {
  SIR_ASK_SYSTEM_PROMPT,
  buildAskContext,
  extractCandidateNames,
  type AskPersonCtx,
  type AskMemoryHit,
  type AskGoalCtx,
} from '@/lib/sir/ask'
import { SIR_ACTION_TOOLS, parseProposedAction, type ProposedAction } from '@/lib/sir/actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_PEOPLE = 5
const MAX_MEM_PER_PERSON = 12

interface ErrorBody { error: string; detail?: string }
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  const userId = authData.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  let body: { question?: unknown }
  try { body = (await req.json()) as { question?: unknown } } catch { return errorJson(400, 'Body JSON invalido') }
  if (typeof body.question !== 'string' || body.question.trim().length === 0) {
    return errorJson(400, 'question requerido (string no vacio)')
  }
  const question = body.question.trim().slice(0, 1000)

  // 1. Todas las personas (para resolver nombres + traer su contexto).
  const { data: peopleRows } = await supabase
    .from('people')
    .select('id, name, slug, relationship, last_contact, importance_score, trust_level, organization, org_group')
    .eq('user_id', userId)
    .limit(1000)
  const allPeople = (peopleRows ?? []) as Array<Record<string, unknown>>
  const byId = new Map<string, Record<string, unknown>>()
  const namesById = new Map<string, string>()
  for (const p of allPeople) {
    byId.set(p.id as string, p)
    namesById.set(p.id as string, (p.name as string) ?? 'alguien')
  }

  // 2. Personas mencionadas por nombre en la pregunta.
  const mentioned = extractCandidateNames(question, allPeople.map((p) => (p.name as string) ?? ''))
  const targetIds = new Set<string>()
  for (const p of allPeople) {
    if (mentioned.includes((p.name as string) ?? '')) targetIds.add(p.id as string)
  }

  // 3. Memorias por búsqueda semántica (best-effort: si no hay OPENAI_API_KEY
  //    o embeddings, seguimos sin esta señal). Sus personas se suman al set.
  const memoryHits: AskMemoryHit[] = []
  try {
    const emb = await embedText(question)
    const { data: matches } = await supabase.rpc('match_memories', {
      query_embedding: toPgVector(emb),
      match_count: 10,
      similarity_threshold: 0.15,
    })
    for (const r of ((matches as Record<string, unknown>[]) ?? [])) {
      const pid = (r.person_id as string | null) ?? null
      if (pid && targetIds.size < MAX_PEOPLE) targetIds.add(pid)
      memoryHits.push({
        content: (r.content as string) ?? '',
        personName: pid ? namesById.get(pid) ?? null : null,
        occurredAt: (r.occurred_at as string | null) ?? null,
      })
    }
  } catch (e) {
    reportApiError(e)
  }

  // 4. Objetivos activos → mapa personId → título.
  const { data: goalRows } = await supabase
    .from('goals')
    .select('title, related_persons, status, next_action')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(100)
  const goals = (goalRows ?? []) as Array<{ title: string; related_persons: unknown; next_action?: string | null }>
  const goalByPerson: Record<string, string> = {}
  for (const g of goals) {
    const ids = Array.isArray(g.related_persons) ? (g.related_persons as string[]) : []
    for (const pid of ids) if (typeof pid === 'string' && !goalByPerson[pid]) goalByPerson[pid] = g.title
  }

  // 5. Contexto por persona (cap MAX_PEOPLE): score + memorias recientes.
  const peopleCtx: AskPersonCtx[] = []
  for (const pid of [...targetIds].slice(0, MAX_PEOPLE)) {
    const row = byId.get(pid)
    if (!row) continue
    let qualities: number[] = []
    try {
      const { data: logs } = await supabase
        .from('person_logs')
        .select('value, logged_at')
        .eq('user_id', userId)
        .eq('person_id', pid)
        .eq('kind', 'interaction')
        .order('logged_at', { ascending: true })
        .limit(50)
      qualities = ((logs as Array<{ value: number }>) ?? []).map((l) => Number(l.value)).filter((v) => Number.isFinite(v))
    } catch { qualities = [] }

    const score = computeRelationalScore({
      importanceScore: Number(row.importance_score) || 5,
      trustLevel: Number(row.trust_level) || 5,
      lastChatObservedAt: (row.last_contact as string | null) ?? null,
      interactionQualities: qualities,
    })

    let recent: string[] = []
    try {
      const mems = await getMemoriesForPerson(supabase, userId, pid, { limit: MAX_MEM_PER_PERSON })
      recent = mems.map((m) => m.content).filter(Boolean)
    } catch { recent = [] }

    peopleCtx.push({
      name: (row.name as string) ?? 'alguien',
      relationship: (row.relationship as string | null) ?? null,
      lastContact: (row.last_contact as string | null) ?? null,
      organization: (row.organization as string | null) ?? null,
      scoreGlobal: score.global,
      fuerza: score.fuerza,
      reciprocidad: score.reciprocidad,
      confianza: score.confianza,
      recentMemories: recent,
      activeGoal: goalByPerson[pid] ?? null,
    })
  }

  // 6. Objetivos para el contexto (todos los activos, acotado).
  const goalsCtx: AskGoalCtx[] = goals.slice(0, 20).map((g) => ({
    title: g.title, status: 'active', nextAction: g.next_action ?? null,
  }))

  // 7. Armar prompt + llamar al modelo.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return errorJson(500, 'Falta ANTHROPIC_API_KEY')

  const context = buildAskContext({
    question,
    todayISO: new Date().toISOString().slice(0, 10),
    people: peopleCtx,
    memories: memoryHits,
    goals: goalsCtx,
  })

  // Resolver el nombre que proponga una acción → personId (con la gente cargada).
  function resolvePersonId(name: string): { id: string | null; name: string } {
    if (!name) return { id: null, name }
    const hits = extractCandidateNames(name, allPeople.map((p) => (p.name as string) ?? ''), 1)
    if (hits.length === 0) return { id: null, name }
    const match = allPeople.find((p) => ((p.name as string) ?? '') === hits[0])
    return { id: (match?.id as string) ?? null, name: hits[0] }
  }

  const ACTION_RULE =
    '\n\nSi Aaron pide HACER algo (registrar/anotar una interacción, o crear/fijar un objetivo), NO lo hagas ni digas que está hecho: llamá a la tool correspondiente para PROPONERLO. Aaron lo confirma aparte. Si solo pregunta, respondé en texto sin tools.'

  try {
    const anthropic = new Anthropic({ apiKey })
    const msg = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 900,
      system: SIR_ASK_SYSTEM_PROMPT + ACTION_RULE,
      tools: SIR_ACTION_TOOLS as unknown as Anthropic.Tool[],
      messages: [{ role: 'user', content: context }],
    })
    const answer = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    // ¿El modelo propuso una acción? La normalizamos y resolvemos la persona.
    // NO se ejecuta acá: el cliente la confirma.
    let proposedAction: (ProposedAction & { personId?: string | null }) | null = null
    const toolUse = msg.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined
    if (toolUse) {
      const parsed = parseProposedAction(toolUse.name, toolUse.input)
      if (parsed?.kind === 'registrar_interaccion') {
        const r = resolvePersonId(parsed.persona)
        proposedAction = { ...parsed, persona: r.name, personId: r.id }
      } else if (parsed?.kind === 'crear_objetivo') {
        const r = parsed.personaRelacionada ? resolvePersonId(parsed.personaRelacionada) : { id: null, name: null }
        proposedAction = { ...parsed, personaRelacionada: r.name, personId: r.id }
      }
    }

    return NextResponse.json(
      {
        answer,
        proposedAction,
        sources: { people: peopleCtx.map((p) => p.name), memories: memoryHits.length },
      },
      { status: 200 },
    )
  } catch (e) {
    reportApiError(e)
    return errorJson(502, 'No se pudo generar la respuesta', e instanceof Error ? e.message : String(e))
  }
}
