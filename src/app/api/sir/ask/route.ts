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
  isPerspectiveQuery,
  selectStrengthMemories,
  extractCandidateNames,
  type AskPersonCtx,
  type AskMemoryHit,
  type AskGoalCtx,
} from '@/lib/sir/ask'
import { parseProposedAction, type ProposedAction } from '@/lib/sir/actions'
import { resolveModel } from '@/lib/sir/model'
import { runSirChat, type ChatTurn } from '@/lib/sir/chatProvider'
import { todayLimaKey } from '@/lib/dates/limaDay'
import { extractDayRef, renderDayContext } from '@/lib/day/dayContext'
import { fetchDayContext } from '@/lib/day/fetch'
import { selectInlineGap, detectContextualGap, detectDealGap, type ContextualSignal, type DealSignal } from '@/lib/gaps/inline'
import type { Person, Goal } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

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

  // Historial de la conversación (multi-turno). Solo texto, acotado. Sirve
  // para (a) resolver referentes ("¿y ella?") en el retrieval y (b) darle al
  // modelo el hilo. Formato: [{ role:'user'|'sir', text }].
  const rawHistory = Array.isArray((body as { history?: unknown }).history)
    ? ((body as { history?: unknown }).history as Array<Record<string, unknown>>)
    : []
  const history = rawHistory
    .filter((h) => (h.role === 'user' || h.role === 'sir') && typeof h.text === 'string')
    .slice(-6)
    .map((h) => ({ role: h.role as 'user' | 'sir', text: (h.text as string).slice(0, 2000) }))

  // Texto para el RETRIEVAL: pregunta actual + últimos turnos del usuario (para
  // arrastrar a quién se refiere un follow-up sin nombre propio).
  const recentUserText = history.filter((h) => h.role === 'user').slice(-2).map((h) => h.text).join(' ')
  const retrievalText = `${recentUserText} ${question}`.trim().slice(0, 1500)

  // 1. Todas las personas (para resolver nombres + traer su contexto).
  const { data: peopleRows } = await supabase
    .from('people')
    .select('id, name, slug, relationship, last_contact, importance_score, trust_level, organization, org_group, birth_date, gender, cycle_start_date, ambito')
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
  const mentioned = extractCandidateNames(retrievalText, allPeople.map((p) => (p.name as string) ?? ''))
  const targetIds = new Set<string>()
  for (const p of allPeople) {
    if (mentioned.includes((p.name as string) ?? '')) targetIds.add(p.id as string)
  }

  // 3. Memorias por búsqueda semántica (best-effort: si no hay OPENAI_API_KEY
  //    o embeddings, seguimos sin esta señal). Sus personas se suman al set.
  const memoryHits: AskMemoryHit[] = []
  try {
    const emb = await embedText(retrievalText)
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
    .select('id, title, related_persons, status, next_action, is_anchor')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(100)
  const goals = (goalRows ?? []) as Array<{ id: string; title: string; related_persons: unknown; next_action?: string | null; is_anchor?: boolean | null }>
  const goalByPerson: Record<string, string> = {}
  for (const g of goals) {
    const ids = Array.isArray(g.related_persons) ? (g.related_persons as string[]) : []
    for (const pid of ids) if (typeof pid === 'string' && !goalByPerson[pid]) goalByPerson[pid] = g.title
  }

  // GAP-ENGINE INLINE (la mitad proactiva de SIR): antes de gastar el modelo,
  // si a SIR le falta UNA pieza clave para responder BIEN esta pregunta —y la
  // pregunta es del TIPO que esa pieza cambia— pregunta primero. SOLO a Aaron,
  // NUNCA a terceros (= guardrail ADR 0009). Ahorra créditos: corta acá.
  const dismissedGaps = new Set(
    Array.isArray((body as { dismissedGaps?: unknown }).dismissedGaps)
      ? ((body as { dismissedGaps?: unknown }).dismissedGaps as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
  )
  // Descartes CROSS-DEVICE (tabla gap_dismissals): se mergean con los del body
  // (localStorage) para que "no sé / saltar" valga en todos los dispositivos.
  try {
    const { data: dRows } = await supabase
      .from('gap_dismissals')
      .select('gap_key')
      .eq('user_id', userId)
      .limit(1000)
    for (const r of ((dRows as Array<{ gap_key: string }>) ?? [])) dismissedGaps.add(r.gap_key)
  } catch { /* best-effort */ }
  const skipInlineGaps = (body as { skipInlineGaps?: unknown }).skipInlineGaps === true
  if (!skipInlineGaps) {
    const targetPeople = [...targetIds]
      .map((pid) => byId.get(pid))
      .filter((r): r is Record<string, unknown> => !!r)
      .map((r) => ({
        id: r.id as string,
        name: (r.name as string) ?? '',
        relationship: (r.relationship as string | null) ?? undefined,
        importanceScore: Number(r.importance_score) || 0,
        birthDate: (r.birth_date as string | null) ?? undefined,
        gender: (r.gender as string | null) ?? undefined,
        cycleStartDate: (r.cycle_start_date as string | null) ?? undefined,
        ambito: (r.ambito as string | null) ?? undefined,
      })) as unknown as Person[]
    const inlineGoals = goals.map((g) => ({
      id: g.id, title: g.title, status: 'active',
      nextAction: (g.next_action ?? '') as string,
      isAnchor: Boolean(g.is_anchor),
    })) as unknown as Goal[]
    const gap = selectInlineGap(question, targetPeople, inlineGoals, dismissedGaps)
    if (gap) {
      return NextResponse.json(
        {
          answer: gap.question,
          clarifying: {
            key: gap.key, kind: gap.kind, entity: gap.entity, entityId: gap.entityId,
            entityName: gap.entityName, field: gap.field, inputType: gap.inputType,
          },
          proposedAction: null,
          sources: { people: [], memories: 0 },
        },
        { status: 200 },
      )
    }
  }

  // 5. Contexto por persona (cap MAX_PEOPLE): score + memorias recientes.
  const peopleCtx: AskPersonCtx[] = []
  const ctxSignals: ContextualSignal[] = []
  for (const pid of [...targetIds].slice(0, MAX_PEOPLE)) {
    const row = byId.get(pid)
    if (!row) continue
    let interactionEvents: { quality: number; at: string }[] = []
    try {
      const { data: logs } = await supabase
        .from('person_logs')
        .select('value, logged_at')
        .eq('user_id', userId)
        .eq('person_id', pid)
        .eq('kind', 'interaction')
        .order('logged_at', { ascending: true })
        .limit(50)
      interactionEvents = ((logs as Array<{ value: number; logged_at: string }>) ?? [])
        .filter((l) => Number.isFinite(Number(l.value)))
        .map((l) => ({ quality: Number(l.value), at: l.logged_at }))
    } catch { interactionEvents = [] }
    const latestEv = interactionEvents.length ? interactionEvents[interactionEvents.length - 1] : null
    ctxSignals.push({
      id: pid, name: (row.name as string) ?? '',
      latestInteractionQuality: latestEv ? latestEv.quality : null,
      latestInteractionAt: latestEv ? latestEv.at : (row.last_contact as string | null) ?? null,
      importance: Number(row.importance_score) || 0,
    })

    const score = computeRelationalScore({
      importanceScore: Number(row.importance_score) || 5,
      trustLevel: Number(row.trust_level) || 5,
      lastChatObservedAt: (row.last_contact as string | null) ?? null,
      interactionEvents,
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

  // GAP-ENGINE INLINE · capa CONTEXTUAL: si la consulta es de contacto y lo
  // último que SIR sabe de esa persona fue tenso, pregunta si ya hablaron antes
  // de aconsejar. Respuesta efímera (no persiste). Corta antes del modelo.
  if (!skipInlineGaps) {
    // Deals abiertos → señal de "deal estancado" (best-effort; la tabla deals no
    // está en el tipo generado, el .from() compila igual).
    let dealSignals: DealSignal[] = []
    try {
      const { data: dealRows } = await supabase
        .from('deals')
        .select('id, title, contact_person_id, status, next_action, next_action_date, updated_at')
        .eq('user_id', userId)
        .eq('status', 'open')
        .limit(50)
      dealSignals = ((dealRows as Array<Record<string, unknown>>) ?? []).map((d) => {
        const cpid = (d.contact_person_id as string | null) ?? null
        const cname = cpid ? namesById.get(cpid) ?? null : null
        return {
          id: d.id as string,
          title: (d.title as string) ?? '',
          contactFirst: cname ? cname.split(/\s+/)[0] : null,
          status: (d.status as string) ?? 'open',
          nextAction: (d.next_action as string | null) ?? null,
          nextActionDate: (d.next_action_date as string | null) ?? null,
          updatedAt: (d.updated_at as string | null) ?? null,
        }
      })
    } catch { dealSignals = [] }

    const ctxGap = detectContextualGap(question, ctxSignals, dismissedGaps)
      ?? detectDealGap(question, dealSignals, dismissedGaps)
    if (ctxGap) {
      return NextResponse.json(
        {
          answer: ctxGap.question,
          clarifying: {
            key: ctxGap.key, kind: ctxGap.kind, entity: ctxGap.entity,
            entityId: ctxGap.entityId, entityName: ctxGap.entityName,
            field: null, inputType: ctxGap.inputType, ephemeral: true,
          },
          proposedAction: null,
          sources: { people: [], memories: 0 },
        },
        { status: 200 },
      )
    }
  }

  // 6. Objetivos para el contexto (todos los activos, acotado).
  const goalsCtx: AskGoalCtx[] = goals.slice(0, 20).map((g) => ({
    title: g.title, status: 'active', nextAction: g.next_action ?? null,
  }))

  // 7. Armar prompt + llamar al modelo.
  // Modelo elegido por el usuario (sir_settings). Best-effort → default sonnet.
  let chatModel: unknown = 'sonnet'
  try {
    const { data: settings } = await supabase
      .from('sir_settings')
      .select('chat_model')
      .eq('user_id', userId)
      .maybeSingle()
    chatModel = settings?.chat_model ?? 'sonnet'
  } catch { /* default */ }
  const model = resolveModel(chatModel)

  // La key del proveedor del modelo elegido vive en env (nunca en la base).
  const providerKey = process.env[model.envKey]
  if (!providerKey) {
    return errorJson(500, `Falta ${model.envKey}`, model.provider === 'openrouter'
      ? 'Agregá OPENROUTER_API_KEY en Vercel para usar modelos OSS, o elegí un modelo Claude.'
      : 'Configurá la API key de Anthropic.')
  }

  // ESPEJO DE FUERZA: si Aaron habla de cómo está, traemos SUS propias palabras
  // de fortaleza (de todas sus memorias) para que SIR se las devuelva.
  let strengths: string[] = []
  if (isPerspectiveQuery(question)) {
    try {
      const { data: allMems } = await supabase
        .from('memories')
        .select('content, occurred_at')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .limit(400)
      strengths = selectStrengthMemories(
        ((allMems as Array<{ content: string; occurred_at: string | null }>) ?? [])
          .map((m) => ({ content: m.content, occurredAt: m.occurred_at })),
        6,
      )
    } catch { strengths = [] }
  }

  const context = buildAskContext({
    question,
    todayISO: todayLimaKey(),
    people: peopleCtx,
    memories: memoryHits,
    goals: goalsCtx,
    strengths,
  })

  // MOTOR "¿qué pasó el día X?": si la pregunta apunta a una fecha, cruzamos
  // TODO lo de ese día (interacciones, capturas, deals, pasos OKR, salud, score,
  // luna) y lo sumamos al grounding. Best-effort. Día calendario de Lima.
  let dayBlock = ''
  try {
    const dayRef = extractDayRef(`${question} ${recentUserText}`, todayLimaKey())
    if (dayRef) {
      const slices = await fetchDayContext(supabase, userId, dayRef)
      dayBlock = '\n\n' + renderDayContext(slices)
    }
  } catch { /* best-effort: el día no debe romper la respuesta */ }
  // Contexto efímero que Aaron agregó al responder un hueco contextual (no se
  // guarda; solo informa ESTA respuesta).
  const userContext = typeof (body as { userContext?: unknown }).userContext === 'string'
    ? ((body as { userContext?: unknown }).userContext as string).trim().slice(0, 500)
    : ''
  const groundedContext = context + dayBlock + (userContext ? `\n\nContexto que Aaron agregó ahora: ${userContext}` : '')

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

  const chatHistory: ChatTurn[] = history.map((h) => ({
    role: h.role === 'sir' ? 'assistant' : 'user',
    content: h.text,
  }))

  try {
    const { answer, tool } = await runSirChat({
      model,
      system: SIR_ASK_SYSTEM_PROMPT + ACTION_RULE,
      history: chatHistory,
      userContent: groundedContext,
      anthropicKey: model.provider === 'anthropic' ? providerKey : undefined,
      openrouterKey: model.provider === 'openrouter' ? providerKey : undefined,
    })

    // ¿El modelo propuso una acción? La normalizamos y resolvemos la persona.
    // NO se ejecuta acá: el cliente la confirma.
    let proposedAction: (ProposedAction & { personId?: string | null; linkedGoals?: { id: string; title: string }[] }) | null = null
    if (tool) {
      const parsed = parseProposedAction(tool.name, tool.input)
      if (parsed?.kind === 'registrar_interaccion') {
        const r = resolvePersonId(parsed.persona)
        proposedAction = { ...parsed, persona: r.name, personId: r.id }
      } else if (parsed?.kind === 'crear_objetivo') {
        const r = parsed.personaRelacionada ? resolvePersonId(parsed.personaRelacionada) : { id: null, name: null }
        proposedAction = { ...parsed, personaRelacionada: r.name, personId: r.id }
      } else if (parsed?.kind === 'crear_persona') {
        proposedAction = { ...parsed }
      } else if (parsed?.kind === 'cerrar_relacion') {
        const r = resolvePersonId(parsed.persona)
        // Objetivos ACTIVOS ligados a esa persona → para ofrecer cerrarlos también.
        const linkedGoals = r.id
          ? goals
              .filter((g) => Array.isArray(g.related_persons) && (g.related_persons as string[]).includes(r.id as string))
              .map((g) => ({ id: g.id, title: g.title }))
          : []
        proposedAction = { ...parsed, persona: r.name, personId: r.id, linkedGoals }
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
