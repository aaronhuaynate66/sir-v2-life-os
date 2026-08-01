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
import { searchChatMessages, renderChatSearchBlock, searchChatMessagesGlobal, dateMentionQuery, extractSearchTerms } from '@/lib/chat-messages/search'
import {
  looksLikeArchiveQuery,
  expandSearchQueries,
  searchChatMessagesDeep,
  mergeSearchHits,
  renderDeepSearchBlock,
} from '@/lib/chat-messages/deepSearch'
import { resolveKinshipMentions } from '@/lib/people/kinship'
import { computeRelationalScore } from '@/lib/people/relationalScore'
import { getYearNorte } from '@/lib/year-compass/norte'
import { cyclePhase } from '@/lib/ciclo/phase'
import { buildDailySignals } from '@/lib/forecast-conductual/dailySignals'
import { runForecast } from '@/lib/forecast-conductual/engine'
import { fetchChatMessages } from '@/lib/chat-messages/read'
import { embedText, toPgVector } from '@/lib/embeddings/client'
import {
  SIR_ASK_SYSTEM_PROMPT,
  PERSON_CONVERSATION_BUDGET,
  buildAskContext,
  buildReceipts,
  isPerspectiveQuery,
  selectStrengthMemories,
  extractCandidateNames,
  isHealthQuery,
  isExamQuery,
  renderExamsBlock,
  isReminderQuery,
  isDealQuery,
  isTensionQuery,
  isCircleCycleQuery,
  isAffectionClimateQuery,
  isAgendaQuery,
  selectRecentHealth,
  renderHealthBlock,
  renderRemindersBlock,
  renderDealsBlock,
  renderTensionAlertsBlock,
  renderCircleCycleBlock,
  renderAffectionClimateBlock,
  renderAgendaBlock,
  type AskPersonCtx,
  type AskMemoryHit,
  type AskGoalCtx,
  type AskPendingTask,
  type SirReceipt,
  type HealthMetricReading,
  type SleepReading,
  type ReminderRow,
  type DealRow,
  type TensionAlertRow,
  type AffectionClimateEntry,
  type AgendaItem,
} from '@/lib/sir/ask'
import { parseProposedAction, type ProposedAction } from '@/lib/sir/actions'
import { resolveModel } from '@/lib/sir/model'
import { runSirChat, type ChatTurn } from '@/lib/sir/chatProvider'
import { renderRecallBlock, shouldPersistExchange, type RecallHit } from '@/lib/sir/recall'
import { buildMemoryFtsQuery } from '@/lib/sir/hybridRecall'
import { renderLearningsBlock, rowToLearning, type LearningRow } from '@/lib/learnings/recall'
import { todayLimaKey, limaDayKey } from '@/lib/dates/limaDay'
import { computeMissingHealthData, renderMissingDataBlock, SLEEP_TYPE, type Reading } from '@/lib/health/missingData'
import { extractDayRef, renderDayContext } from '@/lib/day/dayContext'
import { fetchDayContext } from '@/lib/day/fetch'
import { selectInlineGap, detectContextualGap, detectDealGap, type ContextualSignal, type DealSignal } from '@/lib/gaps/inline'
import { isReaderQuery, renderReaderStatusBlock } from '@/lib/social-reader/readerStatus'
import { loadBrainGraphForUser } from '@/lib/brain/scopedLoader'
import { isNetworkQuery, resolveNetworkSeeds, buildNetworkConnections, renderNetworkBlock } from '@/lib/brain/network'
import { buildCycleWeekAhead, buildCycleWeekAheadLine, type WomanCycleInput } from '@/lib/ciclo/weekAhead'
import { summarizeAffection, describeAffection } from '@/lib/forecast-conductual/affectionSummary'
import { fetchCalendarEvents } from '@/lib/calendar/feed'
import type { Person, Goal, Memory } from '@/types'
import { deVoseo } from '@/lib/text/deVoseo'
import { corregirFalsaEscritura } from './falsaEscritura'
import { labPatterns } from '@/lib/health-exams/patterns'
import { rowToHealthExam } from '@/lib/health-exams/types'
import { computeRecomp, explainRecomp, partitionChange, explainComposition } from '@/lib/salud/recomposicion'
import { parseWeightCategory } from '@/engines/targets'
import { computeGoalAdvance, type GoalAdvance } from '@/lib/goals/advance'
import { objectiveStepAdapter } from '@/lib/supabase/sync/adapters/objectiveSteps'
import { nextPendingLeaf, stepsForObjective } from '@/lib/objectives/steps'

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
  /** agregar_hito: id del objetivo resuelto (por título o el ancla). */
  objetivoId?: string | null
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
  sources: { people: string[]; memories: number; receipts?: SirReceipt[] }
  /** El bloque CONTEXTO exacto con el que respondió, cuando el caller lo pide
   *  (`includeContext`). Es para el HARNESS DE EVAL: el juez castigaba como
   *  "inventado" data que SIR sí tenía —el cumpleaños de la ficha, el reembolso
   *  de una memoria— porque solo veía un resumen. Viendo lo mismo que vio SIR,
   *  el veredicto de grounding deja de mentir. */
  contextUsed?: string
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
  /** Mensaje de SIR que Aaron CITÓ al responder (Telegram reply_to_message). Es
   *  el referente de un "ciérralo" / "escríbele" suelto: sin esto, responderle a
   *  un mensaje del brief se leía como una pregunta nueva y sin tema. Entra al
   *  contexto Y al retrieval (el recall tiene que buscar sobre ESE tema, no
   *  sobre la palabra "ciérralo"). */
  quotedMessage?: string
  /** false = NO persistir el intercambio en sir_conversations (para el harness de
   *  eval: corre contra la data REAL de Aaron y sin esto inyectaba sus preguntas
   *  sintéticas en el recall → SIR resurfaceaba "recordatorios" fantasma). Default true. */
  persist?: boolean
  /** Habilita leer el feed de calendario (Google/Outlook) para la agenda. SOLO
   *  cuando el `supabase` es un cliente de SESIÓN con RLS (route web): el feed no
   *  filtra por user_id, así que bajo service-role (Telegram/crons) leería
   *  conexiones de OTROS usuarios. Default false → agenda solo desde personal_events. */
  readCalendarFeed?: boolean
  /** Devuelve además el CONTEXTO con el que respondió (`contextUsed`). Solo para
   *  el harness de eval — el juez necesita ver lo mismo que vio SIR para no
   *  marcar como inventado lo que estaba en la ficha o en una memoria. */
  includeContext?: boolean
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
  // El mensaje citado entra al RETRIEVAL: si Aaron responde "ciérralo" al bloque
  // de su mamá, hay que recuperar sobre su mamá — no sobre la palabra "ciérralo".
  const quotedMessage = typeof params.quotedMessage === 'string' ? params.quotedMessage.trim().slice(0, 1500) : ''
  const retrievalText = `${recentUserText} ${quotedMessage} ${question}`.trim().slice(0, 2000)

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
    // RECALL HÍBRIDO (Ola 3, mig 0164): vector (cosine) + full-text (español)
    // fusionados con RRF. El vector puro perdía coincidencias LÉXICAS exactas que el
    // embedding difumina (nombres propios, montos, jerga: "Marlab", "RIT"). El FTS
    // las rescata; RRF combina ambos rangos sin re-tunear thresholds entre escalas.
    let matches: Record<string, unknown>[] | null = null
    // p_user_id explícito (heredado de 0162): sin él, recall CIEGO bajo service-role
    // (Telegram/crons) porque auth.uid() es null ahí.
    const hybrid = await supabase.rpc('match_memories_hybrid', {
      query_embedding: toPgVector(questionEmbedding),
      query_text: buildMemoryFtsQuery(retrievalText),
      match_count: 10,
      p_user_id: userId,
    })
    if (hybrid.error) {
      // Ventana de deploy: si el RPC nuevo aún no está en prod, NO apagar el recall.
      // OJO: supabase-js NO lanza ante error de PostgREST (lo deja en .error), por eso
      // se chequea explícito y se cae al vector puro (match_memories, mig 0162, 0.30).
      const { data } = await supabase.rpc('match_memories', {
        query_embedding: toPgVector(questionEmbedding),
        match_count: 10,
        similarity_threshold: 0.3,
        p_user_id: userId,
      })
      matches = (data as Record<string, unknown>[]) ?? []
    } else {
      matches = (hybrid.data as Record<string, unknown>[]) ?? []
    }
    for (const r of (matches ?? [])) {
      const pid = (r.person_id as string | null) ?? null
      if (pid && targetIds.size < MAX_PEOPLE) targetIds.add(pid)
      memoryHits.push({
        content: (r.content as string) ?? '',
        personName: pid ? namesById.get(pid) ?? null : null,
        occurredAt: (r.occurred_at as string | null) ?? null,
      })
    }
  } catch (e) {
    // Recall degradado: si esto falla, SIR queda CIEGO a su memoria larga (le
    // pasó jul/26 con la cuota de OpenAI agotada y nadie se enteró en semanas).
    // Tag distintivo para alertar/filtrar en Sentry. El chat sigue (fail-open)
    // pero con menos contexto — el prompt ya lo obliga a decir "no tengo".
    reportApiError(e, { route: 'askSir:recall', signal: 'RECALL_DEGRADED' })
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
        p_user_id: userId, // mig 0162: funciona bajo service-role (Telegram/crons)
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

  // 3d. Recordatorio de data faltante: de lo que Aaron sube siempre (báscula,
  //     sueño, FC/VFC del día), ¿qué faltó en su última subida? Para que SIR se lo
  //     recuerde proactivo en el chat, no solo en la tarjeta de /salud. Fail-open.
  let missingDataBlock = ''
  try {
    const todayLima = todayLimaKey()
    const cutoffISO = new Date(Date.now() - 20 * 86_400_000).toISOString()
    const [{ data: hmRows }, { data: slRows }] = await Promise.all([
      supabase.from('health_metrics').select('type, measured_at').eq('user_id', userId).gte('measured_at', cutoffISO).limit(2000),
      supabase.from('sleep_records').select('date').eq('user_id', userId).gte('date', cutoffISO.slice(0, 10)).limit(60),
    ])
    const readings: Reading[] = [
      ...((hmRows as Array<{ type: string; measured_at: string }> | null) ?? [])
        .map((r) => ({ type: r.type, day: limaDayKey(r.measured_at) }))
        .filter((r): r is Reading => !!r.day),
      ...((slRows as Array<{ date: string }> | null) ?? []).map((r) => ({ type: SLEEP_TYPE, day: r.date })),
    ]
    const { missing } = computeMissingHealthData(readings, todayLima)
    missingDataBlock = renderMissingDataBlock(missing, todayLima)
  } catch { /* sin data / tabla ausente → sin recordatorio */ }

  // 3e. ESTADO DEL READER SOCIAL: si la pregunta toca Instagram/historias/reader/
  //     redes, inyectamos un bloque con el estado REAL (conteos + última señal) de
  //     unmatched_social_activity y contact_activity. Antes SIR era CIEGO a estas
  //     tablas y NEGABA que Instagram existiera ("nunca se integró") — falso, el
  //     reader las alimenta. Barato: 2 queries de conteo+max, solo cuando aplica.
  //     Fail-soft: si algo revienta, el bloque sale igual afirmando que existe.
  let readerBlock = ''
  if (isReaderQuery(`${question} ${recentUserText}`)) {
    let unmatchedCount = 0
    let contactActivityCount = 0
    let lastSignalISO: string | null = null
    const takeLatest = (row: { observed_at?: string | null; created_at?: string | null } | null | undefined) => {
      for (const iso of [row?.observed_at, row?.created_at]) {
        if (typeof iso === 'string' && (!lastSignalISO || iso > lastSignalISO)) lastSignalISO = iso
      }
    }
    try {
      const [unmatched, contactAct] = await Promise.all([
        supabase
          .from('unmatched_social_activity')
          .select('observed_at, created_at', { count: 'exact' })
          .eq('user_id', userId)
          .order('observed_at', { ascending: false })
          .limit(1),
        supabase
          .from('contact_activity')
          .select('observed_at, created_at', { count: 'exact' })
          .eq('user_id', userId)
          .order('observed_at', { ascending: false })
          .limit(1),
      ])
      unmatchedCount = unmatched.count ?? 0
      contactActivityCount = contactAct.count ?? 0
      takeLatest((unmatched.data as Array<{ observed_at?: string; created_at?: string }> | null)?.[0])
      takeLatest((contactAct.data as Array<{ observed_at?: string; created_at?: string }> | null)?.[0])
    } catch { /* fail-soft: tablas 0150/0152 sin propagar → estado sin cifras */ }
    readerBlock = renderReaderStatusBlock({ unmatchedCount, contactActivityCount, lastSignalISO }, nowISO)
  }

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

  // 5-bis. BÚSQUEDA PROFUNDA (deepSearch): si la pregunta es de ARCHIVO ("¿qué
  //   me dijo?", "¿en qué quedamos?"), la búsqueda literal de la pregunta no
  //   basta — Aaron dice "abonar" y ella escribió "te deposito lo que te debo".
  //   Expandimos la consulta a variantes léxicas reales de WhatsApp (LLM barato,
  //   UNA vez por turno, en paralelo con las lecturas de personas) y buscamos
  //   cada una en el hilo completo. Fail-open: si falla, camino de siempre.
  const archiveMode = looksLikeArchiveQuery(retrievalText)
  const expansionP: Promise<string[]> = archiveMode
    ? expandSearchQueries(question, namesById.get(pids[0] ?? '') ?? 'esa persona', { supabase, userId })
    : Promise.resolve([])

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
      // Modo archivo: variantes léxicas (ya en vuelo) × hilo completo de ESTA persona.
      const deepP: Promise<{ hits: Awaited<typeof hitsP>; queries: string[] } | null> = archiveMode
        ? (async () => {
            const expanded = await expansionP
            const queries = [...new Set([...expanded, ...extractSearchTerms(retrievalText, 2)])]
            if (queries.length === 0) return null
            return { hits: await searchChatMessagesDeep(supabase, userId, pid, queries), queries }
          })().catch(() => null)
        : Promise.resolve(null)
      const [logs, mems, conv, hits, deep] = await Promise.all([logsP, memsP, convP, hitsP, deepP])

      const interactionEvents = logs
        .filter((l) => Number.isFinite(Number(l.value)))
        .map((l) => ({ quality: Number(l.value), at: l.logged_at }))
      const latestEv = interactionEvents.length ? interactionEvents[interactionEvents.length - 1] : null
      // Contacto REAL del sustrato: el último mensaje de la ventana reciente que
      // ya trajo getPersonConversation (sin query extra). Sin esto el gap-engine
      // solo miraba person_logs/last_contact y cortaba la respuesta con "no sé
      // nada de Diana hace 866 días" teniendo 72k mensajes suyos.
      const lastChatAt = conv?.recentMessages?.length
        ? conv.recentMessages[conv.recentMessages.length - 1]?.timestamp ?? null
        : null
      const ctxSignal: ContextualSignal = {
        id: pid, name: (row.name as string) ?? '',
        latestInteractionQuality: latestEv ? latestEv.quality : null,
        latestInteractionAt: latestEv ? latestEv.at : (row.last_contact as string | null) ?? null,
        importance: Number(row.importance_score) || 0,
        lastChatAt,
      }

      const score = computeRelationalScore({
        importanceScore: Number(row.importance_score) || 5,
        trustLevel: Number(row.trust_level) || 5,
        lastChatObservedAt: (row.last_contact as string | null) ?? null,
        interactionEvents,
      })

      const memsWithSource = (mems as Array<{ content: string; source?: Memory['source'] }>)
        .map((m) => ({ content: m.content, source: m.source }))
        .filter((m) => m.content)
      const recent = memsWithSource.map((m) => m.content)

      // Conversación (ventana reciente del sustrato + observación) + búsqueda FTS
      // en el historial completo, anexada.
      let conversation: string | null = conv ? renderConversationForPrompt(conv, name) : null
      // En modo archivo el bloque PROFUNDO reemplaza al simple: dice con qué
      // palabras se buscó y prohíbe afirmar que se leyó el hilo completo.
      const block = deep
        ? renderDeepSearchBlock(mergeSearchHits([deep.hits, hits]), name, deep.queries)
        : renderChatSearchBlock(hits, name)
      // En modo archivo el bloque va PRIMERO y con presupuesto: buildAskContext
      // recorta la conversación a PERSON_CONVERSATION_BUDGET y la ventana
      // reciente se comía justo los mensajes ENCONTRADOS (van al final por orden
      // cronológico) → SIR no "veía" el resultado de su propia búsqueda.
      if (block) {
        if (deep) {
          const room = PERSON_CONVERSATION_BUDGET - block.length - 2
          const tail = room > 200 && conversation ? `\n\n${conversation.slice(0, room)}` : ''
          conversation = `${block}${tail}`
        } else {
          conversation = conversation ? `${conversation}\n\n${block}` : block
        }
      }

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

      // Sin fecha exacta de ciclo pero PREGUNTARON por ella (targetIds) y es
      // mujer → estimamos la ventana conductual desde PATRONES de WhatsApp
      // (forecast-conductual, exploratorio, sin fecha manual). Solo para la
      // persona preguntada (cara: lee su hilo) → 0-1 por turno. Fail-open.
      let behaviorWindow: AskPersonCtx['behaviorWindow'] = null
      if (!cycle && targetIds.has(pid) && (row.gender as string | null) === 'female') {
        try {
          const subRows = await fetchChatMessages(supabase, userId, pid, 50_000)
          const subMsgs = subRows
            .filter((r) => typeof r.sent_at === 'string' && r.sent_at.length >= 10)
            .map((r) => ({ at: r.sent_at as string, author: r.sender === 'user' ? 'user' as const : 'other' as const, text: r.content ?? '', kind: r.is_media ? 'media' as const : 'text' as const }))
          const signals = buildDailySignals(subMsgs)
          if (signals.length >= 8) {
            const fc = runForecast({ signals, anchors: [], now: nowDate })
            if (fc && fc.mainWindow) {
              const todayKey = nowDate.toISOString().slice(0, 10)
              const ext = fc.extendedWindow
              const inNow = !!ext && todayKey >= ext.start && todayKey <= ext.end
              const daysTo = fc.mainWindow.start
                ? Math.round((Date.parse(fc.mainWindow.start) - Date.parse(todayKey)) / 86_400_000)
                : null
              behaviorWindow = {
                periodDays: fc.periodDays,
                mainStart: fc.mainWindow.start,
                mainEnd: fc.mainWindow.end,
                confidenceLabel: fc.confidence.label,
                inWindowNow: inNow,
                daysToWindow: daysTo,
              }
            }
          }
        } catch { /* fail-open: sin ventana estimada */ }
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
        behaviorWindow,
      }
      return { ctxSignal, personCtx, receiptMems: memsWithSource }
    }),
  )
  const receiptPeople: { name: string; memories: { content: string; source?: Memory['source'] }[] }[] = []
  for (const b of built) {
    if (!b) continue
    ctxSignals.push(b.ctxSignal)
    peopleCtx.push(b.personCtx)
    if (b.receiptMems.length > 0) receiptPeople.push({ name: b.personCtx.name, memories: b.receiptMems })
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
  //
  // SUB-PASOS: hasta el 28-jul el chat era ciego a `objective_steps` — 151 pasos
  // en la base y no podía responder "¿cómo voy con Boticas?". Se cargan acá y se
  // resume el avance REAL (rollup de pasos, no el escalar `goals.progress`, que
  // solo se recalcula si /objetivos está abierta en el navegador — ver #995).
  // Fail-soft: si la lectura falla, el contexto queda como antes.
  const advanceByGoal = new Map<string, GoalAdvance>()
  const nextStepByGoal = new Map<string, { title: string; due: string | null; detail: string | null; done: string | null }>()
  /** Los pendientes con fecha cercana, que son los que el brief AVISA. */
  let pendingTasks: AskPendingTask[] = []
  try {
    const { data: stepRows, error: stepErr } = await supabase
      .from('objective_steps').select('*').eq('user_id', userId).limit(1000)
    if (stepErr) throw new Error(stepErr.message) // PostgREST no lanza (#947)
    const steps = ((stepRows ?? []) as Array<Record<string, unknown>>).map((r) => objectiveStepAdapter.fromRow(r))
    const hoy = nowISO.slice(0, 10)
    for (const g of goals) {
      advanceByGoal.set(g.id, computeGoalAdvance(steps, g.id, hoy))
      const leaf = nextPendingLeaf(stepsForObjective(steps, g.id))
      if (leaf) nextStepByGoal.set(g.id, { title: leaf.title, due: leaf.targetDate ?? null, detail: leaf.description ?? null, done: leaf.acceptanceCriteria ?? null })
    }

    // Además del siguiente paso por objetivo, se pasan los que TIENEN FECHA en la
    // ventana que el brief usa para avisar. Sin esto, si él pregunta por algo que
    // el brief acaba de decirle, el chat no tiene esa fila y solo puede repetirle
    // el título — que es exactamente lo que pasó con la factura de S/1,500 el
    // 29-jul. La ventana mira atrás porque un pendiente vencido se sigue avisando.
    const desde = new Date(Date.parse(`${hoy}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)
    const hasta = new Date(Date.parse(`${hoy}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10)
    const enVentana = steps
      .filter((s) => s.status !== 'hecho' && s.targetDate && s.targetDate >= desde && s.targetDate <= hasta)
      .sort((a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? ''))

    // Los objetivos padre se traen APARTE y sin filtrar por estado: el array
    // `goals` de arriba es solo de ACTIVOS, y el objetivo del que colgaba la
    // factura estaba PAUSADO — que es justo el dato que había que poder decir.
    const idsObjetivo = [...new Set(enVentana.map((s) => s.objectiveId).filter(Boolean))]
    const metaObjetivo = new Map<string, { title: string; status: string | null }>()
    if (idsObjetivo.length > 0) {
      const { data: padres } = await supabase
        .from('goals').select('id, title, status').eq('user_id', userId).in('id', idsObjetivo).limit(50)
      for (const p of (padres ?? []) as Array<{ id: string; title: string; status: string | null }>) {
        metaObjetivo.set(p.id, { title: p.title, status: p.status })
      }
    }

    // Los de objetivos VIVOS primero. Un objetivo pausado con 20 pasos fechados se
    // comía el cupo (5 de 10 eran de "Boticas Jhodaal") y tapaba pendientes reales.
    // No se descartan —hay que poder responder "eso está pausado" si él pregunta—,
    // solo ceden el lugar.
    const dormido = (s: { objectiveId: string }) => {
      const st = metaObjetivo.get(s.objectiveId)?.status
      return st === 'paused' || st === 'archived' ? 1 : 0
    }
    const conFecha = [...enVentana]
      .sort((a, b) => dormido(a) - dormido(b) || (a.targetDate ?? '').localeCompare(b.targetDate ?? ''))
      .slice(0, 10)

    pendingTasks = conFecha.map((s) => {
      const g = metaObjetivo.get(s.objectiveId)
      return {
        title: s.title, due: s.targetDate ?? null, detail: s.description ?? null,
        goalTitle: g?.title ?? null, goalStatus: g?.status ?? null,
      }
    })
  } catch { /* fail-soft: sin pasos, el contexto de objetivos queda como antes */ }

  const goalsCtx: AskGoalCtx[] = goals.slice(0, 20).map((g) => {
    const adv = advanceByGoal.get(g.id)
    const next = nextStepByGoal.get(g.id)
    return {
      title: g.title, status: 'active', nextAction: g.next_action ?? null,
      isAnchor: g.id === anchorGoalId,
      progress: adv?.percent ?? null,
      stepsDone: adv?.done ?? null,
      stepsTotal: adv?.total ?? null,
      overdue: adv?.overdue ?? null,
      nextStep: next?.title ?? null,
      nextStepDue: next?.due ?? null,
      nextStepDetail: next?.detail ?? null,
      nextStepDone: next?.done ?? null,
    }
  })

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
        ? 'Agrega OPENROUTER_API_KEY en Vercel para usar modelos OSS, o elegí un modelo Claude.'
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
    pendingTasks,
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

  // PUNTOS CIEGOS (PR feat/sir-menos-ciego): SIR computa/guarda estas fuentes pero
  // el chat nunca las SURFACEA → negaba features reales. Cada bloque se trae SOLO si
  // la pregunta lo pide (gating por intención, evita inflar el prompt) y es fail-soft.

  // SALUD RECIENTE: valores reales (peso, sueño de anoche, FC/VFC/SpO₂). Distinto de
  // missingDataBlock, que solo dice qué FALTA — este trae los números.
  let healthBlock = ''
  // EXÁMENES MÉDICOS, en su propio bloque y con su propio gate. Va SIEMPRE que la
  // pregunta sea de salud o de exámenes: `health_exams` guardaba `summary`,
  // `findings` y `recommendations` desde la mig 0149 y NADIE los leía — solo se
  // consumían los patrones de `values` numéricos. La tomografía del 27-jul entró con
  // 11 recomendaciones (incluida la bandera del hematoma septal, ventana de DÍAS) y
  // SIR no podía nombrar ninguna ni preguntándoselo directo.
  let examsBlock = ''
  if (isHealthQuery(question) || isExamQuery(question)) {
    try {
      const { data: exRows } = await supabase
        .from('health_exams')
        .select('exam_date, provider, title, summary, findings, values, recommendations')
        .eq('user_id', userId).order('exam_date', { ascending: false }).limit(20)
      const exams = ((exRows as Array<Record<string, unknown>>) ?? [])
        .map((r) => rowToHealthExam(r))
      examsBlock = renderExamsBlock(exams)
    } catch { /* sin exámenes → sin bloque */ }
  }

  if (isHealthQuery(question)) {
    try {
      const cutoffISO = new Date(nowDate.getTime() - 30 * 86_400_000).toISOString()
      const [{ data: hmRows }, { data: slRows }] = await Promise.all([
        supabase.from('health_metrics')
          .select('type, value, unit, measured_at')
          .eq('user_id', userId).gte('measured_at', cutoffISO)
          .order('measured_at', { ascending: false }).limit(600),
        supabase.from('sleep_records')
          .select('date, duration, quality, score, awakenings')
          .eq('user_id', userId)
          .order('date', { ascending: false }).limit(5),
      ])
      const metricRows: HealthMetricReading[] = ((hmRows as Array<Record<string, unknown>>) ?? [])
        .map((r) => ({ type: r.type as string, value: Number(r.value), unit: (r.unit as string | null) ?? null, measuredAt: (r.measured_at as string) ?? '' }))
      const sleepRows: SleepReading[] = ((slRows as Array<Record<string, unknown>>) ?? [])
        .map((r) => ({ date: (r.date as string) ?? '', duration: Number(r.duration), quality: r.quality != null ? Number(r.quality) : null, score: r.score != null ? Number(r.score) : null, awakenings: r.awakenings != null ? Number(r.awakenings) : null }))
      healthBlock = renderHealthBlock(selectRecentHealth(metricRows, sleepRows))

      // CRUCE MÉDICO-DEPORTIVO (Aaron 25-jul: «¿por qué no me dice cómo subir
      // masa muscular si la balanza marca alto en grasa y los exámenes dicen lo
      // mismo?»). Dos piezas que el chat NUNCA veía:
      //
      //  a) LABORATORIOS. `labPatterns` ya detectaba analitos con tendencia
      //     consistente aunque cada valor esté "en rango" —lo que ningún examen
      //     aislado marca— pero solo salía en el brief de los LUNES. En su data:
      //     hemoglobina 16.8→14.5→13.9, hematocrito 52→44→41 y glóbulos rojos
      //     5.72→4.84→4.64, los tres bajando a la vez.
      //  b) RECOMPOSICIÓN. La aritmética de composición contra su categoría de
      //     peso: por qué "bajar grasa" y "no bajar de 80 kg" solo son
      //     compatibles ganando músculo, y cuánto.
      try {
        const { data: exRows } = await supabase
          .from('health_exams')
          .select('id, exam_date, provider, title, summary, findings, values, recommendations, storage_path')
          .eq('user_id', userId).order('exam_date', { ascending: true }).limit(50)
        const exams = ((exRows as Array<Record<string, unknown>>) ?? [])
          .map((r) => ({ ...rowToHealthExam(r), pdfUrl: null }))
        if (exams.length >= 2) {
          const pats = labPatterns(exams).slice(0, 4)
          if (pats.length > 0) {
            healthBlock += `\n\nPATRONES DE LABORATORIO (cruce de ${exams.length} exámenes; cada valor puede estar "en rango" y aun así la TENDENCIA importa — esto NO es diagnóstico, es para que lo lleve a su médico):\n`
              + pats.map((p) => `  - [${p.severity}] ${p.message}`).join('\n')
          }
        }
      } catch { /* sin exámenes → sin bloque */ }

      try {
        const peso = metricRows.find((m) => m.type === 'weight')?.value
        const grasa = metricRows.find((m) => m.type === 'body_fat_percent')?.value
        const magro = metricRows.find((m) => m.type === 'muscle_mass_kg')?.value
        const tmb = metricRows.find((m) => m.type === 'metabolic_rate_kcal')?.value
        // El goal con categoría de peso, con sus campos completos (el array
        // `goals` de arriba solo trae id/title/next_action para el gap-engine).
        const { data: catRows } = await supabase
          .from('goals').select('title, description, target, target_date')
          .eq('user_id', userId).eq('status', 'active').limit(50)
        const catGoal = ((catRows as Array<Record<string, unknown>>) ?? [])
          .find((g) => /mundial|taekwondo|wfg/i.test(`${g.title ?? ''} ${g.description ?? ''}`))
        const cat = catGoal
          ? parseWeightCategory((catGoal.target as string | null) ?? undefined)
            ?? parseWeightCategory((catGoal.description as string | null) ?? undefined)
          : null
        if (peso && grasa && cat) {
          const targetDate = (catGoal?.target_date as string | null) ?? null
          const semanas = targetDate
            ? Math.max(1, Math.round((Date.parse(`${targetDate}T12:00:00Z`) - nowDate.getTime()) / (7 * 86_400_000)))
            : 12
          const target = { minWeightKg: cat.min + 1, targetFatPercent: 20, weeksAvailable: semanas }
          const plan = computeRecomp(
            { weightKg: peso, bodyFatPercent: grasa, leanMassKg: magro ?? null, bmrKcal: tmb ?? null },
            target,
          )
          healthBlock += `\n\nRECOMPOSICIÓN vs SU CATEGORÍA (${cat.min} kg+, ${semanas} semanas al evento) — aritmética sobre su propia báscula:\n`
            + explainRecomp(plan, target, grasa).map((l) => `  - ${l}`).join('\n')
            + '\n  Usa esto si pregunta por grasa, músculo, peso o cómo entrenar para el Mundial: el conflicto entre "bajar de peso" (lo que dice su chequeo) y "no bajar de categoría" se resuelve por COMPOSICIÓN, no por dieta agresiva.'

          // ¿Y lo que YA viene pasando es grasa o músculo? Bajar de peso no dice
          // nada solo: importa qué se está yendo. Se parte con peso + %grasa de
          // la misma báscula, sobre las lecturas de los últimos 2 meses.
          const puntos = metricRows
            .filter((m) => m.type === 'weight' || m.type === 'body_fat_percent')
            .reduce((acc, m) => {
              const day = (m.measuredAt ?? '').slice(0, 10)
              if (!day) return acc
              const cur = acc.get(day) ?? {}
              if (m.type === 'weight') cur.weightKg = m.value
              else cur.bodyFatPercent = m.value
              acc.set(day, cur)
              return acc
            }, new Map<string, { weightKg?: number; bodyFatPercent?: number }>())
          const serieComp = [...puntos.entries()]
            .filter(([, v]) => v.weightKg != null && v.bodyFatPercent != null)
            .map(([day, v]) => ({ day, weightKg: v.weightKg as number, bodyFatPercent: v.bodyFatPercent as number }))
          const cambio = explainComposition(partitionChange(serieComp, 60, nowDate))
          if (cambio) healthBlock += `\n  - QUÉ VIENE PASANDO (grasa vs músculo): ${cambio}`
        }
      } catch { /* sin composición → sin bloque */ }
    } catch { /* fail-soft: sin salud → el prompt ya sabe no negar la capacidad */ }
  }

  // RECORDATORIOS PENDIENTES: askSir los CREA pero nunca los leía. Ahora los lista.
  let remindersBlock = ''
  if (isReminderQuery(question)) {
    try {
      const { data: remRows } = await supabase.from('reminders')
        .select('text, due_at, related_person_id')
        .eq('user_id', userId).is('done_at', null)
        .order('due_at', { ascending: true }).limit(20)
      const reminders: ReminderRow[] = ((remRows as Array<Record<string, unknown>>) ?? []).map((r) => {
        const pid = (r.related_person_id as string | null) ?? null
        return { text: (r.text as string) ?? '', dueAt: (r.due_at as string) ?? '', personName: pid ? namesById.get(pid) ?? null : null }
      })
      remindersBlock = renderRemindersBlock(reminders, todayLimaKey())
    } catch { /* tabla 0115 ausente / sin data → sin bloque */ }
  }

  // OPORTUNIDADES: los deals ya se cargaban para detectDealGap pero se descartaban.
  let dealsBlock = ''
  if (isDealQuery(question)) {
    try {
      const { data: dRows } = await supabase.from('deals')
        .select('title, stage, amount, currency, next_action, next_action_date, close_window, contact_person_id')
        .eq('user_id', userId).eq('status', 'open')
        .order('updated_at', { ascending: false }).limit(20)
      const deals: DealRow[] = ((dRows as Array<Record<string, unknown>>) ?? []).map((d) => {
        const pid = (d.contact_person_id as string | null) ?? null
        return {
          title: (d.title as string) ?? '',
          stage: (d.stage as string | null) ?? null,
          amount: d.amount != null ? Number(d.amount) : null,
          currency: (d.currency as string | null) ?? null,
          nextAction: (d.next_action as string | null) ?? null,
          nextActionDate: (d.next_action_date as string | null) ?? null,
          closeWindow: (d.close_window as string | null) ?? null,
          contactName: pid ? namesById.get(pid) ?? null : null,
        }
      })
      dealsBlock = renderDealsBlock(deals)
    } catch { /* tabla 0084 ausente / sin data → sin bloque */ }
  }

  // ALERTAS DE TENSIÓN: person_status_alerts activas (no descartadas).
  let tensionBlock = ''
  if (isTensionQuery(question)) {
    try {
      const { data: aRows } = await supabase.from('person_status_alerts')
        .select('person_id, from_label, to_label, message, created_at')
        .eq('user_id', userId).is('dismissed_at', null)
        .order('created_at', { ascending: false }).limit(15)
      const alerts: TensionAlertRow[] = ((aRows as Array<Record<string, unknown>>) ?? []).map((a) => {
        const pid = (a.person_id as string | null) ?? null
        return {
          personName: pid ? namesById.get(pid) ?? null : null,
          fromLabel: (a.from_label as string | null) ?? null,
          toLabel: (a.to_label as string | null) ?? null,
          message: (a.message as string) ?? '',
          createdAt: (a.created_at as string | null) ?? null,
        }
      })
      tensionBlock = renderTensionAlertsBlock(alerts)
    } catch { /* tabla 0113 ausente / sin data → sin bloque */ }
  }

  // RED / CONEXIONES: SIR era CIEGO al grafo tipado del cerebro (src/lib/brain/*).
  // Solo cuando la pregunta es de RED/CAMINOS ("quién conoce a / me presenta a /
  // está cerca de un objetivo") cargamos el grafo (SCOPEADO por user_id — seguro
  // bajo service-role/Telegram) y difundimos desde las personas/orgs/objetivos
  // que la pregunta nombra. OJO COSTO: gated por intención + acotado a semillas +
  // top-N; no corre el grafo completo en cada turno. Fail-soft.
  let networkBlock = ''
  if (isNetworkQuery(`${question} ${recentUserText}`)) {
    try {
      const graph = await loadBrainGraphForUser(supabase, userId)
      const seeds = resolveNetworkSeeds(`${question} ${recentUserText}`, graph, [...targetIds])
      const connections = buildNetworkConnections(graph, seeds, 12)
      networkBlock = renderNetworkBlock(seeds, connections)
    } catch { /* fail-soft: sin grafo → el prompt ya sabe no negar la capacidad */ }
  }

  // SEMANA / CICLO DEL CÍRCULO: askSir solo miraba el ciclo de la persona
  // PREGUNTADA (cycle_start_date / patrones live). Nunca corría el detector de la
  // SEMANA (buildCycleWeekAhead) ni leía las anclas manuales de person_cycles. Este
  // bloque replica la query del cron morning-push (mujeres + anclas), corre el
  // detector puro y surfacea la línea de CUIDADO. Fail-soft.
  let circleCycleBlock = ''
  if (isCircleCycleQuery(`${question} ${recentUserText}`)) {
    try {
      const { data: womenRows } = await supabase
        .from('people')
        .select('id, name, gender, cycle_start_date, cycle_length_days')
        .eq('user_id', userId)
        .or('gender.eq.female,cycle_start_date.not.is.null')
        .limit(500)
      const womenPeople = ((womenRows as Array<{ id: string; name: string; gender: string | null; cycle_start_date: string | null; cycle_length_days: number | null }>) ?? [])
      if (womenPeople.length > 0) {
        const wIds = womenPeople.map((p) => p.id)
        const cyclesByPerson = new Map<string, Array<{ date: string; phase: string }>>()
        try {
          const since = new Date(nowDate.getTime() - 60 * 86_400_000).toISOString().slice(0, 10)
          const { data: cyc } = await supabase
            .from('person_cycles')
            .select('person_id, date, phase')
            .eq('user_id', userId)
            .in('person_id', wIds)
            .gte('date', since)
            .limit(1000)
          for (const c of ((cyc as Array<{ person_id: string; date: string; phase: string }>) ?? [])) {
            const arr = cyclesByPerson.get(c.person_id) ?? []
            arr.push({ date: c.date, phase: c.phase })
            cyclesByPerson.set(c.person_id, arr)
          }
        } catch { /* sin anclas → proyección solo por calendario */ }
        const womenInput: WomanCycleInput[] = womenPeople
          .map((p) => ({
            personId: p.id, name: p.name,
            cycleStartDate: p.cycle_start_date ? p.cycle_start_date.slice(0, 10) : null,
            cycleLengthDays: p.cycle_length_days ?? null,
            anchors: cyclesByPerson.get(p.id) ?? [],
          }))
          .filter((w) => w.cycleStartDate || (w.anchors && w.anchors.length > 0))
        const line = buildCycleWeekAheadLine(buildCycleWeekAhead(womenInput, nowDate, 7))
        circleCycleBlock = renderCircleCycleBlock(line)
      }
    } catch { /* fail-soft: tabla person_cycles sin propagar → sin bloque */ }
  }

  // CLIMA AFECTIVO (IAE): densidad de afecto + ratio de positividad recientes de
  // la(s) persona(s) preguntada(s), desde person_daily_signals (mig 0158). askSir
  // nunca leía estas columnas. Marco de CUIDADO: disparador de conversación, no
  // veredicto (afecto expresado ≠ sentido). Solo con persona en foco. Fail-soft.
  let affectionBlock = ''
  if (isAffectionClimateQuery(`${question} ${recentUserText}`) && targetIds.size > 0) {
    try {
      const pids = [...targetIds].slice(0, 3)
      const entries: AffectionClimateEntry[] = []
      for (const pid of pids) {
        const { data: sigRows } = await supabase
          .from('person_daily_signals')
          .select('date, message_count, affection, positivity_ratio')
          .eq('user_id', userId).eq('person_id', pid)
          .order('date', { ascending: true }).limit(400)
        const signals = ((sigRows as Array<{ date: string; message_count: number | null; affection: number | null; positivity_ratio: number | null }>) ?? [])
          .map((r) => ({
            date: r.date,
            messageCount: Number(r.message_count) || 0,
            affection: Number(r.affection) || 0,
            positivityRatio: Number(r.positivity_ratio) || 0,
            avgLen: 0, somatic: 0, friction: 0, withdrawal: 0, sensitivity: 0, actions: 0, composite: 0,
          }))
        const desc = describeAffection(summarizeAffection(signals))
        if (desc) entries.push({ name: namesById.get(pid) ?? 'esa persona', description: desc })
      }
      affectionBlock = renderAffectionClimateBlock(entries)
    } catch { /* fail-soft: columna 0158 sin propagar → sin bloque */ }
  }

  // AGENDA / EVENTOS PRÓXIMOS: personal_events por rango (mig 0133) + —solo en
  // sesión web (readCalendarFeed)— el feed de calendario (Google personal +
  // Outlook laboral). askSir no veía ninguno de los dos. Fail-soft.
  let agendaBlock = ''
  if (isAgendaQuery(`${question} ${recentUserText}`)) {
    const today = todayLimaKey()
    const horizonEndISO = limaDayKey(new Date(nowDate.getTime() + 30 * 86_400_000).toISOString()) ?? today
    const items: AgendaItem[] = []
    try {
      const { data: peRows } = await supabase.from('personal_events')
        .select('title, event_date, person_id')
        .eq('user_id', userId)
        .gte('event_date', today).lte('event_date', horizonEndISO)
        .order('event_date', { ascending: true }).limit(50)
      for (const r of ((peRows as Array<{ title: string; event_date: string; person_id: string | null }>) ?? [])) {
        const pid = (r.person_id as string | null) ?? null
        const title = (r.title ?? '').trim()
        if (!title) continue
        items.push({ date: (r.event_date ?? '').slice(0, 10), title, personName: pid ? namesById.get(pid) ?? null : null, sourceLabel: 'plan' })
      }
    } catch { /* tabla 0133 ausente → sin planes */ }
    if (params.readCalendarFeed === true) {
      try {
        const feed = await fetchCalendarEvents({
          supabase: supabase as unknown as NonNullable<Parameters<typeof fetchCalendarEvents>[0]>['supabase'],
          horizonDays: 30, limit: 80, nowMs: nowDate.getTime(),
        })
        for (const ev of feed.events ?? []) {
          const day = (ev.start ?? '').slice(0, 10)
          if (!day || day < today || day > horizonEndISO) continue
          items.push({ date: day, title: (ev.title ?? '').slice(0, 120) || 'evento', sourceLabel: ev.calendarLabel ?? 'calendario' })
        }
      } catch { /* fail-soft: feed caído → solo planes */ }
    }
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    agendaBlock = renderAgendaBlock(items, today)
  }

  const socratic = params.mode === 'socratic'
  const chatStyle = params.chatStyle === true
  const userContext = typeof params.userContext === 'string' ? params.userContext.trim().slice(0, 500) : ''
  const groundedContext =
    context +
    dayBlock +
    (learningsBlock ? `\n\n${learningsBlock}` : '') +
    (recallBlock ? `\n\n${recallBlock}` : '') +
    (missingDataBlock ? `\n\n${missingDataBlock}` : '') +
    (healthBlock ? `\n\n${healthBlock}` : '') +
    // Va DESPUÉS de healthBlock: los números del wearable son el "hoy" y el examen
    // es el contexto de fondo contra el que se leen.
    (examsBlock ? `\n\n${examsBlock}` : '') +
    (remindersBlock ? `\n\n${remindersBlock}` : '') +
    (dealsBlock ? `\n\n${dealsBlock}` : '') +
    (tensionBlock ? `\n\n${tensionBlock}` : '') +
    (readerBlock ? `\n\n${readerBlock}` : '') +
    (networkBlock ? `\n\n${networkBlock}` : '') +
    (circleCycleBlock ? `\n\n${circleCycleBlock}` : '') +
    (affectionBlock ? `\n\n${affectionBlock}` : '') +
    (agendaBlock ? `\n\n${agendaBlock}` : '') +
    (userContext ? `\n\nContexto que Aaron agregó ahora: ${userContext}` : '') +
    (quotedMessage
      ? `\n\nAaron está RESPONDIENDO a este mensaje tuyo (lo citó en el chat):\n"""\n${quotedMessage}\n"""\nSu mensaje se refiere a ESO. Resuélvelo sobre ese contenido —"ciérralo", "hazlo", "sí" apuntan a lo que dice ahí— y no cambies de tema.`
      : '')

  // Resolver el nombre que proponga una acción → personId.
  function resolvePersonId(name: string): { id: string | null; name: string } {
    if (!name) return { id: null, name }
    const hits = extractCandidateNames(name, allPeople.map((p) => (p.name as string) ?? ''), 1)
    if (hits.length === 0) return { id: null, name }
    const match = allPeople.find((p) => ((p.name as string) ?? '') === hits[0])
    return { id: (match?.id as string) ?? null, name: hits[0] }
  }

  const SOCRATIC_RULE =
    '\n\nMODO SOCRÁTICO: en vez de darle la respuesta cómoda, devuélvele la PREGUNTA dura y precisa que lo obligue a pensar, aterrizada en SUS hechos (cita el dato, la persona o el patrón concreto del contexto). Máximo una o dos preguntas, directas, sin rodeos ni adulación. La pregunta debe abrir una grieta real en su razonamiento, no interrogar por interrogar. Si pide HACER algo concreto, igual propón la acción con la tool.'
  const ACTION_RULE =
    '\n\nSi Aaron pide HACER algo (registrar/anotar una interacción, crear/fijar un objetivo, agregar una persona, cerrar un vínculo, MARCAR UN HÁBITO como hecho — "ya medité", "hice la cama" —, MARCAR UNA TAREA/paso de un objetivo como hecho — "ya saqué la visa", "terminé el informe" —, AGREGAR un sub-paso/hito a un objetivo existente — "el examen médico me acerca al Mundial", "anota que rendir el TOEFL es un paso para mi maestría" (usa proponer_agregar_hito; si no nombra el objetivo, se asume su norte) —, AGENDAR un plan/cita/salida a futuro — "agéndame ver el depa con Diana el sábado", "anota que voy al matrimonio de Laura" —, o AGENDAR un RECORDATORIO con fecha/hora — "recuérdame mañana 9am pedir mis pastillas", "avísame el viernes 3pm llamar al banco" (SÍ puedes: usa proponer_crear_recordatorio; NO digas que no puedes programar recordatorios por hora), o MARCAR EL ESTADO de ánimo/biológico de una persona en un día — "Diana estuvo de mal humor hoy", "anduvo tensa/renegando", "le vino la regla ayer" (SÍ puedes: usa proponer_registrar_estado; esa marca con fecha alimenta la detección de patrones)), NO lo hagas ni digas que está hecho: llama a la tool correspondiente para PROPONERLO. Aaron lo confirma aparte. PROHIBIDO decir "listo", "te lo marco", "ya lo agendé/anoté" o similar SIN haber llamado a la tool: si no existe una tool para eso, dilo con honestidad ("todavía no puedo agendar/guardar eso solo") en vez de fingir que lo hiciste. Si solo pregunta, responde en texto sin tools.'
  const CHAT_STYLE_RULE =
    '\n\nESTILO CHAT (mensajería tipo Telegram/WhatsApp): estás en un chat, no en una app con formato. Sé BREVE y conversacional — 1 a 3 párrafos cortos, como un mensaje de un amigo que te conoce. PROHIBIDO el markdown: NADA de **negritas**, ni ## títulos, ni listas con - o números, ni tablas. Texto corrido, cálido, directo. Si necesitas enumerar, hazlo dentro de una frase. Da lo esencial primero; si hay más, ofrece seguir en vez de volcarlo todo.'

  const chatHistory: ChatTurn[] = history.map((h) => ({
    role: h.role === 'sir' ? 'assistant' : 'user',
    content: h.text,
  }))

  const { answer: rawAnswer, tool } = await runSirChat({
    model,
    system: SIR_ASK_SYSTEM_PROMPT + ACTION_RULE + (socratic ? SOCRATIC_RULE : '') + (chatStyle ? CHAT_STYLE_RULE : ''),
    history: chatHistory,
    userContent: groundedContext,
    anthropicKey: model.provider === 'anthropic' ? providerKey : undefined,
    openrouterKey: model.provider === 'openrouter' ? providerKey : undefined,
  })
  // Scrub DETERMINÍSTICO de voseo: el prompt lo prohíbe pero el modelo se resbala
  // (el harness cazó "quieres"). Esto garantiza tuteo peruano en la salida.
  let answer = deVoseo(rawAnswer)

  // GUARD DE FALSA ESCRITURA, por el mismo motivo que el scrub de arriba: el
  // prompt lo prohíbe y el modelo se resbala igual. El 29-jul Aaron avisó que a
  // Diana Díaz le había venido la regla y SIR contestó "acabo de recalcular su
  // ciclo" sin llamar a ninguna tool — el dato nunca se guardó y él quedó creyendo
  // que sí. Si la respuesta afirma haber guardado algo y NO hay tool, se le pega
  // un aviso que lo desmiente.
  const guard = corregirFalsaEscritura(answer, { huboTool: !!tool })
  if (guard.corregida) {
    answer = guard.respuesta
    reportApiError(new Error('SIR afirmó una escritura sin llamar a la tool'), {
      route: 'sir/ask', frase: guard.frase ?? '', pregunta: question.slice(0, 120),
    })
  }

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
    } else if (parsed?.kind === 'marcar_tarea') {
      proposedAction = { ...parsed } // match por título al ejecutar (como hábitos)
    } else if (parsed?.kind === 'agregar_hito') {
      // Resolvemos el objetivo por TÍTULO (tolerante: exacto normalizado → inclusión)
      // o, si Aaron no nombró uno, al NORTE (objetivo-ancla). Fail-safe: si no hay
      // objetivo que resolver, NO proponemos (el hito no tendría dónde vivir).
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
      const q = norm(parsed.objetivo)
      let match: { id: string; title: string } | null = null
      if (q) {
        const exact = goals.find((g) => norm(g.title) === q)
        match = exact
          ? { id: exact.id, title: exact.title }
          : (() => {
              const inc = goals.filter((g) => { const t = norm(g.title); return t.includes(q) || q.includes(t) })
              return inc.length >= 1 ? { id: inc[0].id, title: inc[0].title } : null
            })()
      }
      if (!match && anchorGoalId) {
        const anchor = goals.find((g) => g.id === anchorGoalId)
        if (anchor) match = { id: anchor.id, title: anchor.title }
      }
      if (match) proposedAction = { ...parsed, objetivo: match.title, objetivoId: match.id }
    } else if (parsed?.kind === 'crear_plan') {
      const r = parsed.persona ? resolvePersonId(parsed.persona) : { id: null, name: null }
      proposedAction = { ...parsed, persona: r.name, personId: r.id }
    } else if (parsed?.kind === 'cerrar_relacion') {
      const r = resolvePersonId(parsed.persona)
      const linkedGoals = r.id
        ? goals
            .filter((g) => Array.isArray(g.related_persons) && (g.related_persons as string[]).includes(r.id as string))
            .map((g) => ({ id: g.id, title: g.title }))
        : []
      proposedAction = { ...parsed, persona: r.name, personId: r.id, linkedGoals }
    } else if (parsed?.kind === 'registrar_estado') {
      const r = resolvePersonId(parsed.persona)
      proposedAction = { ...parsed, persona: r.name, personId: r.id }
    } else if (parsed?.kind === 'registrar_entrenamiento') {
      // Sin persona: tipo + fecha. Sin esta rama la tool quedaría inerte (el
      // modelo la llamaría y proposedAction saldría null) — el mismo bug que
      // tuvo crear_recordatorio.
      proposedAction = { ...parsed }
    } else if (parsed?.kind === 'crear_recordatorio') {
      // Sin persona: solo texto + cuándo. Faltaba esta rama → toda la feature de
      // recordatorios por chat (tool + ejecutor + cron reminders-due) quedaba
      // inerte: el modelo llamaba la tool pero proposedAction salía null.
      proposedAction = { ...parsed }
    }
  }

  // Cuando SIR PROPONE una acción (Aaron aún debe confirmar), el texto no debe
  // sonar a "ya está hecho" — el harness cazó "¡Listo! Te lo propongo:". Si abre
  // con una afirmación de hecho, o quedó muy corto, lo reemplazamos por una línea
  // honesta (la propuesta se confirma en la tarjeta/botones aparte).
  if (proposedAction) {
    const t = answer.trim()
    const soundsDone = /^[¡!\s]*(listo|hecho|ya\s+(lo|la|te|est)|agendad|anotad|guardad|marcad|cread)/i.test(t)
    if (soundsDone || t.length < 12) answer = 'Te propongo esto — revísalo y confírmalo. 👇'
  }

  // C3 — persistir el intercambio como memoria recuperable. Se guarda SIEMPRE,
  // AUNQUE el embedding esté caído (OpenAI 429): el registro histórico NO debe
  // depender de OpenAI. Sin embedding → va null y un backfill lo llena cuando el
  // recall vuelva. Antes esto estaba pegado al embedding → todas las charlas
  // desde el 13/07 se perdieron por la cuota agotada. Nunca más.
  if (params.persist !== false && shouldPersistExchange(question, answer)) {
    try {
      await supabase.from('sir_conversations').insert({
        user_id: userId,
        question: question.slice(0, 2000),
        answer: answer.slice(0, 4000),
        embedding: questionEmbedding ? toPgVector(questionEmbedding) : null,
        embedding_model: 'text-embedding-3-small',
      })
    } catch { /* tabla 0121 no aplicada → seguimos sin persistir */ }
  }

  return {
    answer,
    proposedAction,
    sources: {
      people: peopleCtx.map((p) => p.name),
      memories: memoryHits.length,
      // Recibos: las memorias reales que aterrizaron la respuesta, con su origen.
      // Se muestran en el chat para que Aaron verifique, no confíe a ciegas.
      receipts: buildReceipts(receiptPeople),
    },
    ...(params.includeContext ? { contextUsed: groundedContext } : {}),
  }
}
