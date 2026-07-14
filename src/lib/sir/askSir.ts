// SIR V2 — askSir(): el cerebro conversacional, DESACOPLADO del transporte.
//
// Extraído de POST /api/sir/ask (refactor sin cambio de comportamiento). Recibe
// un `supabase` + `userId` YA resueltos (sesión web, o service-role + owner id en
// el webhook de Telegram) y devuelve un resultado plano. NO sabe de HTTP, sesión,
// rate-limit ni NextResponse — eso queda en cada caller.
//
// Reusado por: /api/sir/ask (web/PWA, sesión) y /api/telegram/webhook (por-token).
// El grounding (RAG de memorias, recall cross-session C3, learnings, goals,
// gap-engine, contexto por persona) es idéntico al del route original.

import type { SupabaseClient } from '@supabase/supabase-js'

import { reportApiError } from '@/lib/observability/reportApiError'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { getPersonConversation, renderConversationForPrompt } from '@/lib/people/conversation'
import { searchChatMessages, renderChatSearchBlock, searchChatMessagesGlobal, dateMentionQuery } from '@/lib/chat-messages/search'
import { resolveKinshipMentions } from '@/lib/people/kinship'
import { computeRelationalScore } from '@/lib/people/relationalScore'
import { getYearNorte } from '@/lib/year-compass/norte'
import { cyclePhase } from '@/lib/ciclo/phase'
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
import { renderRecallBlock, shouldPersistExchange, type RecallHit } from '@/lib/sir/recall'
import { renderLearningsBlock, rowToLearning, type LearningRow } from '@/lib/learnings/recall'
import { todayLimaKey } from '@/lib/dates/limaDay'
import { extractDayRef, renderDayContext } from '@/lib/day/dayContext'
import { fetchDayContext } from '@/lib/day/fetch'
import { selectInlineGap, detectContextualGap, detectDealGap, type ContextualSignal, type DealSignal } from '@/lib/gaps/inline'
import type { Person, Goal } from '@/types'

const MAX_PEOPLE = 5
const MAX_MEM_PER_PERSON = 12

/** El proveedor del modelo elegido no tiene su API key en env. El caller lo
 *  traduce al status/detalle HTTP que corresponda. */
export class AskSirConfigError extends Error {
  constructor(public envKey: string, public detail: string) {
    super(`Falta ${envKey}`)
    this.name = 'AskSirConfigError'
  }
}

export type ProposedActionResolved = ProposedAction & {
  personId?: string | null
  linkedGoals?: { id: string; title: string }[]
}

export interface AskSirClarifying {
  key: string
  kind: string
  entity: string
  entityId: string | null
  entityName: string | null
  field: string | null
  inputType: string
  ephemeral?: boolean
}

export interface AskSirResult {
  answer: string
  /** Presente solo cuando SIR corta antes del modelo para pedir una pieza. */
  clarifying?: AskSirClarifying
  proposedAction: ProposedActionResolved | null
  sources: { people: string[]; memories: number }
}

export interface AskSirParams {
  supabase: SupabaseClient
  userId: string
  question: string
  /** Turnos previos (crudos); se filtran y acotan adentro. */
  history?: Array<{ role?: unknown; text?: unknown }>
  /** Scope explícito a una persona (ask-box de la ficha). */
  personId?: string | null
  /** Gaps ya descartados por el cliente (localStorage); se mergean con gap_dismissals. */
  dismissedGaps?: string[]
  skipInlineGaps?: boolean
  mode?: string | null
  /** Estilo chat de mensajería (Telegram): breve, conversacional, sin markdown. */
  chatStyle?: boolean
  /** Contexto efímero que Aaron agregó al responder un hueco (no se persiste). */
  userContext?: string
  /** Inyectable para tests/determinismo. Default: ahora. */
  nowISO?: string
}

/**
 * Responde una pregunta de Aaron aterrizada en su data. Puede cortar antes del
 * modelo devolviendo `clarifying` (gap-engine). PURO respecto de HTTP: lanza
 * AskSirConfigError si falta la API key del proveedor, y propaga el error del
 * modelo para que el caller lo mapee a 502.
 */
export async function askSir(params: AskSirParams): Promise<AskSirResult> {
  const { supabase, userId } = params
  const nowISO = params.nowISO ?? new Date().toISOString()
  const nowDate = new Date(nowISO)
  const question = params.question.trim().slice(0, 1000)

  // Historial multi-turno: solo texto, acotado. Resuelve referentes ("¿y ella?")
  // en el retrieval y le da el hilo al modelo. Formato: [{ role:'user'|'sir', text }].
  const history = (Array.isArray(params.history) ? params.history : [])
    .filter((h) => (h.role === 'user' || h.role === 'sir') && typeof h.text === 'string')
    .slice(-6)
    .map((h) => ({ role: h.role as 'user' | 'sir', text: (h.text as string).slice(0, 2000) }))

  const recentUserText = history.filter((h) => h.role === 'user').slice(-2).map((h) => h.text).join(' ')
  const retrievalText = `${recentUserText} ${question}`.trim().slice(0, 1500)

  // 1. Todas las personas (para resolver nombres + traer su contexto).
  const { data: peopleRows } = await supabase
    .from('people')
    .select('id, name, slug, relationship, last_contact, importance_score, trust_level, organization, org_group, birth_date, gender, cycle_start_date, cycle_length_days, ambito')
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

  // 2b. PARENTESCO: "mi papá / mi vieja / mi novia" no matchean por nombre. El
  //     vínculo vive en person_links (person_a_id='self', kind='padre'|...).
  //     Sin esto, preguntar por un pariente por su ROL no lo traía al contexto
  //     y el modelo confabulaba. Fail-open.
  try {
    const { data: links } = await supabase
      .from('person_links')
      .select('person_b_id, kind')
      .eq('user_id', userId)
      .eq('person_a_id', 'self')
      .limit(100)
    const selfLinks = ((links as Array<{ person_b_id: string; kind: string }>) ?? [])
      .map((l) => ({ personId: l.person_b_id, kind: l.kind }))
    for (const pid of resolveKinshipMentions(retrievalText, selfLinks)) {
      if (byId.has(pid)) targetIds.add(pid)
    }
  } catch { /* best-effort */ }

  // Scope explícito por persona (ask-box de la ficha): garantiza que ESA persona
  // entre al contexto aunque la pregunta no la nombre. Antes del augmento por
  // memorias, así sobrevive el cap MAX_PEOPLE.
  const scopedPersonId = typeof params.personId === 'string' ? params.personId : null
  if (scopedPersonId && byId.has(scopedPersonId)) targetIds.add(scopedPersonId)

  // 3. Memorias por búsqueda semántica (best-effort). El embedding se computa UNA
  //    vez y se reusa para el recall C3 y para persistir el intercambio al final.
  const memoryHits: AskMemoryHit[] = []
  let questionEmbedding: number[] | null = null
  try {
    questionEmbedding = await embedText(retrievalText)
    const { data: matches } = await supabase.rpc('match_memories', {
      query_embedding: toPgVector(questionEmbedding),
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

  // 3b. C3 — RAG cross-session: intercambios PASADOS con SIR parecidos a esta
  //     pregunta, para continuidad ("la semana pasada me dijiste…"). Fail-open.
  let recallBlock = ''
  if (questionEmbedding) {
    try {
      const { data: convs } = await supabase.rpc('match_sir_conversations', {
        query_embedding: toPgVector(questionEmbedding),
        match_count: 5,
        similarity_threshold: 0.2,
      })
      const hits: RecallHit[] = ((convs as Record<string, unknown>[]) ?? []).map((c) => ({
        question: (c.question as string) ?? '',
        answer: (c.answer as string) ?? '',
        createdAt: (c.created_at as string | null) ?? null,
        similarity: (c.similarity as number) ?? 0,
      }))
      recallBlock = renderRecallBlock(hits, nowISO)
    } catch { /* tabla 0121 no aplicada / sin RPC → sin recall */ }
  }

  // 3c. Fase 3d — lecciones durables que SIR aprendió de Aaron. Fail-open.
  let learningsBlock = ''
  try {
    const { data: lrows } = await supabase
      .from('learnings')
      .select('text, kind, confidence, reinforced_count')
      .eq('user_id', userId).eq('is_active', true)
      .order('reinforced_count', { ascending: false }).limit(30)
    if (lrows && lrows.length > 0) {
      learningsBlock = renderLearningsBlock((lrows as LearningRow[]).map(rowToLearning))
    }
  } catch { /* tabla 0140 no aplicada → sin lecciones */ }

  // 4. Objetivos activos → mapa personId → título.
  const { data: goalRows } = await supabase
    .from('goals')
    .select('id, title, related_persons, status, next_action, is_anchor')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(100)
  const goals = (goalRows ?? []) as Array<{ id: string; title: string; related_persons: unknown; next_action?: string | null; is_anchor?: boolean | null }>
  const norte = await getYearNorte(supabase, userId)
  const anchorGoalId = norte?.id ?? null
  const goalByPerson: Record<string, string> = {}
  for (const g of goals) {
    const ids = Array.isArray(g.related_persons) ? (g.related_persons as string[]) : []
    for (const pid of ids) if (typeof pid === 'string' && !goalByPerson[pid]) goalByPerson[pid] = g.title
  }

  // GAP-ENGINE INLINE: antes de gastar el modelo, si a SIR le falta UNA pieza
  // clave para responder BIEN —y la pregunta es del tipo que esa pieza cambia—
  // pregunta primero. SOLO a Aaron (guardrail ADR 0009). Corta acá.
  const dismissedGaps = new Set(
    Array.isArray(params.dismissedGaps)
      ? params.dismissedGaps.filter((x): x is string => typeof x === 'string')
      : [],
  )
  try {
    const { data: dRows } = await supabase
      .from('gap_dismissals')
      .select('gap_key')
      .eq('user_id', userId)
      .limit(1000)
    for (const r of ((dRows as Array<{ gap_key: string }>) ?? [])) dismissedGaps.add(r.gap_key)
  } catch { /* best-effort */ }
  const skipInlineGaps = params.skipInlineGaps === true
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
      isAnchor: g.id === anchorGoalId,
    })) as unknown as Goal[]
    const gap = selectInlineGap(question, targetPeople, inlineGoals, dismissedGaps)
    if (gap) {
      return {
        answer: gap.question,
        clarifying: {
          key: gap.key, kind: gap.kind, entity: gap.entity, entityId: gap.entityId,
          entityName: gap.entityName, field: gap.field, inputType: gap.inputType,
        },
        proposedAction: null,
        sources: { people: [], memories: 0 },
      }
    }
  }

  // 5. Contexto por persona (cap MAX_PEOPLE): score + memorias + conversación +
  //    búsqueda en el historial. Se arma EN PARALELO —entre personas y entre las
  //    queries de cada persona— porque son independientes: en serie eran ~25
  //    queries encadenadas (decenas de segundos con el sustrato de 428k msgs).
  const peopleCtx: AskPersonCtx[] = []
  const ctxSignals: ContextualSignal[] = []
  const pids = [...targetIds].slice(0, MAX_PEOPLE)
  const built = await Promise.all(
    pids.map(async (pid) => {
      const row = byId.get(pid)
      if (!row) return null
      const name = (row.name as string) ?? 'esa persona'

      // Las 4 lecturas de la persona, concurrentes y fail-open cada una.
      const logsP = (async () => {
        try {
          const { data } = await supabase
            .from('person_logs')
            .select('value, logged_at')
            .eq('user_id', userId).eq('person_id', pid).eq('kind', 'interaction')
            .order('logged_at', { ascending: true }).limit(50)
          return (data as Array<{ value: number; logged_at: string }>) ?? []
        } catch { return [] as Array<{ value: number; logged_at: string }> }
      })()
      const memsP = getMemoriesForPerson(supabase, userId, pid, { limit: MAX_MEM_PER_PERSON }).catch(() => [])
      const convP = getPersonConversation(supabase, userId, pid).catch(() => null)
      const hitsP = searchChatMessages(supabase, userId, pid, retrievalText, 6).catch(() => [])
      const [logs, mems, conv, hits] = await Promise.all([logsP, memsP, convP, hitsP])

      const interactionEvents = logs
        .filter((l) => Number.isFinite(Number(l.value)))
        .map((l) => ({ quality: Number(l.value), at: l.logged_at }))
      const latestEv = interactionEvents.length ? interactionEvents[interactionEvents.length - 1] : null
      const ctxSignal: ContextualSignal = {
        id: pid, name: (row.name as string) ?? '',
        latestInteractionQuality: latestEv ? latestEv.quality : null,
        latestInteractionAt: latestEv ? latestEv.at : (row.last_contact as string | null) ?? null,
        importance: Number(row.importance_score) || 0,
      }

      const score = computeRelationalScore({
        importanceScore: Number(row.importance_score) || 5,
        trustLevel: Number(row.trust_level) || 5,
        lastChatObservedAt: (row.last_contact as string | null) ?? null,
        interactionEvents,
      })

      const recent = (mems as Array<{ content: string }>).map((m) => m.content).filter(Boolean)

      // Conversación (ventana reciente del sustrato + observación) + búsqueda FTS
      // en el historial completo, anexada.
      let conversation: string | null = conv ? renderConversationForPrompt(conv, name) : null
      const block = renderChatSearchBlock(hits, name)
      if (block) conversation = conversation ? `${conversation}\n\n${block}` : block

      // Ciclo menstrual: si tiene fecha de período, fase actual (dato sensible).
      let cycle: AskPersonCtx['cycle'] = null
      const cycleStart = (row.cycle_start_date as string | null) ?? null
      if (cycleStart) {
        const cp = cyclePhase(cycleStart, Number(row.cycle_length_days) || 28, nowDate)
        if (cp) cycle = {
          label: cp.label, cycleDay: cp.cycleDay, cycleLength: cp.cycleLength,
          daysUntilNextPeriod: cp.daysUntilNextPeriod, isPmsWindow: cp.isPmsWindow,
          isFertileWindow: cp.isFertileWindow, note: cp.contextNote,
        }
      }

      const personCtx: AskPersonCtx = {
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
        conversation,
        cycle,
      }
      return { ctxSignal, personCtx }
    }),
  )
  for (const b of built) {
    if (!b) continue
    ctxSignals.push(b.ctxSignal)
    peopleCtx.push(b.personCtx)
  }

  // GAP-ENGINE INLINE · capa CONTEXTUAL: consulta de contacto + último dato tenso
  // → pregunta si ya hablaron antes de aconsejar. Efímero. Corta antes del modelo.
  if (!skipInlineGaps) {
    let dealSignals: DealSignal[] = []
    try {
      const { data: dealRows } = await supabase
        .from('deals')
        .select('id, title, contact_person_id, status, next_action, next_action_date, updated_at, amount, stage')
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
          amount: typeof d.amount === 'number' ? d.amount : (d.amount != null ? Number(d.amount) : null),
          stage: typeof d.stage === 'string' ? d.stage : 'lead',
        }
      })
    } catch { dealSignals = [] }

    const ctxGap = detectContextualGap(question, ctxSignals, dismissedGaps)
      ?? detectDealGap(question, dealSignals, dismissedGaps)
    if (ctxGap) {
      return {
        answer: ctxGap.question,
        clarifying: {
          key: ctxGap.key, kind: ctxGap.kind, entity: ctxGap.entity,
          entityId: ctxGap.entityId, entityName: ctxGap.entityName,
          field: null, inputType: ctxGap.inputType, ephemeral: true,
        },
        proposedAction: null,
        sources: { people: [], memories: 0 },
      }
    }
  }

  // 6. Objetivos para el contexto (todos los activos, acotado).
  const goalsCtx: AskGoalCtx[] = goals.slice(0, 20).map((g) => ({
    title: g.title, status: 'active', nextAction: g.next_action ?? null,
    isAnchor: g.id === anchorGoalId,
  }))

  // 7. Armar prompt + llamar al modelo. Modelo elegido por el usuario (sir_settings).
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

  const providerKey = process.env[model.envKey]
  if (!providerKey) {
    throw new AskSirConfigError(
      model.envKey,
      model.provider === 'openrouter'
        ? 'Agregá OPENROUTER_API_KEY en Vercel para usar modelos OSS, o elegí un modelo Claude.'
        : 'Configurá la API key de Anthropic.',
    )
  }

  // ESPEJO DE FUERZA: si Aaron habla de cómo está, traemos SUS palabras de
  // fortaleza para que SIR se las devuelva.
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

  // MOTOR "¿qué pasó el día X?": si la pregunta apunta a una fecha, cruzamos TODO
  // lo de ese día y lo sumamos al grounding. Best-effort. Día calendario de Lima.
  let dayBlock = ''
  try {
    const dayRef = extractDayRef(`${question} ${recentUserText}`, todayLimaKey())
    if (dayRef) {
      const slices = await fetchDayContext(supabase, userId, dayRef)
      dayBlock = '\n\n' + renderDayContext(slices)
      // CRUCE por MENCIÓN de la fecha: además de lo agendado ESE día, buscamos en
      // TODO el chat si alguien MENCIONÓ esa fecha (planes: "quedamos el 18 de
      // julio", "el 18 viajo"). Clave para fechas FUTURAS —el calendario está
      // vacío pero puede haber un plan hablado—. Fail-open.
      const dq = dateMentionQuery(dayRef)
      if (dq) {
        const hits = await searchChatMessagesGlobal(supabase, userId, dq, 8)
        if (hits.length > 0) {
          const lines = hits
            .slice()
            .sort((a, b) => (a.sent_at ?? '').localeCompare(b.sent_at ?? ''))
            .map((h) => {
              const who = h.sender === 'user' ? 'Aaron' : (namesById.get(h.personId) ?? 'alguien')
              return `  [${(h.sent_at ?? '').slice(0, 10)}] ${who}: ${(h.content ?? '').slice(0, 200)}`
            })
          dayBlock += `\n\nMenciones de esa fecha en tus chats (planes/citas habladas, de cualquier persona):\n${lines.join('\n')}`
        }
      }
    }
  } catch { /* best-effort: el día no debe romper la respuesta */ }

  const socratic = params.mode === 'socratic'
  const chatStyle = params.chatStyle === true
  const userContext = typeof params.userContext === 'string' ? params.userContext.trim().slice(0, 500) : ''
  const groundedContext =
    context +
    dayBlock +
    (learningsBlock ? `\n\n${learningsBlock}` : '') +
    (recallBlock ? `\n\n${recallBlock}` : '') +
    (userContext ? `\n\nContexto que Aaron agregó ahora: ${userContext}` : '')

  // Resolver el nombre que proponga una acción → personId.
  function resolvePersonId(name: string): { id: string | null; name: string } {
    if (!name) return { id: null, name }
    const hits = extractCandidateNames(name, allPeople.map((p) => (p.name as string) ?? ''), 1)
    if (hits.length === 0) return { id: null, name }
    const match = allPeople.find((p) => ((p.name as string) ?? '') === hits[0])
    return { id: (match?.id as string) ?? null, name: hits[0] }
  }

  const SOCRATIC_RULE =
    '\n\nMODO SOCRÁTICO: en vez de darle la respuesta cómoda, devolvé la PREGUNTA dura y precisa que lo obligue a pensar, aterrizada en SUS hechos (citá el dato, la persona o el patrón concreto del contexto). Máximo una o dos preguntas, directas, sin rodeos ni adulación. La pregunta debe abrir una grieta real en su razonamiento, no interrogar por interrogar. Si pide HACER algo concreto, igual proponé la acción con la tool.'
  const ACTION_RULE =
    '\n\nSi Aaron pide HACER algo (registrar/anotar una interacción, crear/fijar un objetivo, agregar una persona, cerrar un vínculo, o MARCAR UN HÁBITO DEL DÍA como hecho — "ya medití", "hice la cama", "leí"), NO lo hagas ni digas que está hecho: llamá a la tool correspondiente para PROPONERLO. Aaron lo confirma aparte. Si solo pregunta, respondé en texto sin tools.'
  const CHAT_STYLE_RULE =
    '\n\nESTILO CHAT (mensajería tipo Telegram/WhatsApp): estás en un chat, no en una app con formato. Sé BREVE y conversacional — 1 a 3 párrafos cortos, como un mensaje de un amigo que te conoce. PROHIBIDO el markdown: NADA de **negritas**, ni ## títulos, ni listas con - o números, ni tablas. Texto corrido, cálido, directo. Si necesitás enumerar, hacelo dentro de una frase. Dá lo esencial primero; si hay más, ofrecé seguir en vez de volcarlo todo.'

  const chatHistory: ChatTurn[] = history.map((h) => ({
    role: h.role === 'sir' ? 'assistant' : 'user',
    content: h.text,
  }))

  const { answer, tool } = await runSirChat({
    model,
    system: SIR_ASK_SYSTEM_PROMPT + ACTION_RULE + (socratic ? SOCRATIC_RULE : '') + (chatStyle ? CHAT_STYLE_RULE : ''),
    history: chatHistory,
    userContent: groundedContext,
    anthropicKey: model.provider === 'anthropic' ? providerKey : undefined,
    openrouterKey: model.provider === 'openrouter' ? providerKey : undefined,
  })

  // ¿El modelo propuso una acción? La normalizamos y resolvemos la persona. NO se
  // ejecuta acá: el cliente la confirma.
  let proposedAction: ProposedActionResolved | null = null
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
    } else if (parsed?.kind === 'marcar_habito') {
      proposedAction = { ...parsed }
    } else if (parsed?.kind === 'cerrar_relacion') {
      const r = resolvePersonId(parsed.persona)
      const linkedGoals = r.id
        ? goals
            .filter((g) => Array.isArray(g.related_persons) && (g.related_persons as string[]).includes(r.id as string))
            .map((g) => ({ id: g.id, title: g.title }))
        : []
      proposedAction = { ...parsed, persona: r.name, personId: r.id, linkedGoals }
    }
  }

  // C3 — persistir el intercambio como memoria recuperable (fail-open).
  if (questionEmbedding && shouldPersistExchange(question, answer)) {
    try {
      await supabase.from('sir_conversations').insert({
        user_id: userId,
        question: question.slice(0, 2000),
        answer: answer.slice(0, 4000),
        embedding: toPgVector(questionEmbedding),
        embedding_model: 'text-embedding-3-small',
      })
    } catch { /* tabla 0121 no aplicada → seguimos sin persistir */ }
  }

  return {
    answer,
    proposedAction,
    sources: { people: peopleCtx.map((p) => p.name), memories: memoryHits.length },
  }
}
