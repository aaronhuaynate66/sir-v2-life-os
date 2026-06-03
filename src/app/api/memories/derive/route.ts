// SIR V2 — POST /api/memories/derive (camino ADITIVO: observations → memories)
//
// Materializa memorias en la tabla `memories` a partir de las observations
// curadas de una persona, usando Anthropic para la síntesis (fallback
// determinístico si el modelo falla o no devuelve nada parseable).
//
// Todas las capturas (incluido el export de WhatsApp) escriben `observations`;
// el flujo dedicado /captura/whatsapp y su dual-write a relationships.history
// quedaron deprecados (la columna history se conserva, sin escritores nuevos).
// Idempotente vía el PRIMARY KEY `id` (determinístico
// `mem_obs:<observationId>:<n>`, existe desde 0001).
//
// MEJORAS (caso Dayana, 03/06/2026):
//   - RECENCIA + CONCIENCIA DEL OBJETIVO: el digest llega partido por recencia
//     y se inyecta el contexto de los objetivos vinculados a la persona, para
//     extraer señales relevantes al deal y degradar lo viejo (ver derivePrompt).
//   - RE-DERIVAR conversaciones: las observaciones de CONVERSACIÓN se vuelven a
//     derivar SIEMPRE (el usuario clickea "Derivar" y obtiene el resultado
//     mejorado sin re-importar). Se reemplazan las memorias derivadas VIVAS de
//     esa conversación; se PRESERVAN los descartes del usuario (is_obsolete=true).
//     Perfiles/notas siguen siendo idempotentes (se saltan si ya están cubiertos).
//
// Body JSON: { person_id: string }
// Response 200: { generated, inserted, skipped, alreadyCovered, usedLlm, refreshed }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { getObservationsForPerson } from '@/lib/observations/fetch'
import { getGoalsForPerson, buildGoalContext } from '@/lib/goals/forPerson'
import {
  QUALIFYING_CAPTURE_TYPES,
  MAX_MEMORIES_PER_CONVERSATION,
  derivedMemoryId,
  observationIdFromMemoryId,
  parseDerivedKey,
  isConversationCapture,
  selectDerivableObservations,
  selectUncoveredObservations,
  digestObservations,
  baseMemoriesFromObservations,
  memoriesFromLlmItems,
  derivedMemoryToRow,
} from '@/lib/memories/deriveFromObservations'
import type { Observation } from '@/lib/capture/observations/types'
import {
  DERIVE_MEMORIES_SYSTEM_PROMPT,
  buildDeriveInput,
  parseDeriveResponse,
} from '@/lib/memories/derivePrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_OBSERVATIONS = 30

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

/** Memorias derivadas existentes de un conjunto de observaciones: índices
 *  RESERVADOS (descartes/tombstones is_obsolete=true) e ids VIVOS a reemplazar
 *  en un refresh. Sólo el namespace derivado (`mem_obs:`). */
interface ExistingDerived {
  reservedByObs: Map<string, Set<number>>
  liveIdsByObs: Map<string, string[]>
}

async function fetchExistingDerived(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  observationIds: string[],
): Promise<ExistingDerived> {
  const reservedByObs = new Map<string, Set<number>>()
  const liveIdsByObs = new Map<string, string[]>()
  if (observationIds.length === 0) return { reservedByObs, liveIdsByObs }

  // is_obsolete es de la migración 0045 (puede no estar en prod). Si el filtro
  // rompe, reintentamos sin la columna (todos cuentan como vivos: sin tombstones).
  const build = (withObsolete: boolean) => {
    const cols = withObsolete ? 'id, observation_id, is_obsolete' : 'id, observation_id'
    return supabase.from('memories').select(cols).eq('user_id', userId).in('observation_id', observationIds)
  }
  let { data, error } = await build(true)
  let hasObsoleteCol = true
  if (error) {
    hasObsoleteCol = false
    ;({ data, error } = await build(false))
  }
  if (error || !data) return { reservedByObs, liveIdsByObs }

  for (const raw of data as unknown as Record<string, unknown>[]) {
    const id = raw.id as string
    const obsId = observationIdFromMemoryId(id) // sólo namespace derivado
    if (!obsId) continue
    const parsed = parseDerivedKey(id.slice(4))
    if (!parsed) continue
    const isObsolete = hasObsoleteCol && raw.is_obsolete === true
    if (isObsolete) {
      const set = reservedByObs.get(obsId) ?? new Set<number>()
      set.add(parsed.index)
      reservedByObs.set(obsId, set)
    } else {
      const arr = liveIdsByObs.get(obsId) ?? []
      arr.push(id)
      liveIdsByObs.set(obsId, arr)
    }
  }
  return { reservedByObs, liveIdsByObs }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response
  const userId = authData.user.id

  let body: { person_id?: unknown }
  try {
    body = (await req.json()) as { person_id?: unknown }
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }
  if (typeof body.person_id !== 'string' || body.person_id.length === 0) {
    return errorJson(400, 'person_id requerido (string no vacio)')
  }
  const personId = body.person_id

  // Ownership + nombre para el prompt.
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id, name')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) {
    return errorJson(500, 'No se pudo verificar la persona', personErr.message)
  }
  if (!personRow) {
    return errorJson(404, 'Persona no encontrada o sin permiso')
  }
  const personName = (personRow.name as string) ?? 'esta persona'

  // Contexto de objetivos vinculados (conciencia del deal). Tolerante: si falla
  // el fetch o no hay objetivos, goalContext = null (prompt corre como antes).
  const goals = await getGoalsForPerson(supabase, userId, personId)
  const goalContext = buildGoalContext(goals)

  // Observations curadas que califican. (getObservationsForPerson ya excluye
  // is_obsolete=true.)
  const fetched = await getObservationsForPerson(supabase, userId, personId, {
    captureType: QUALIFYING_CAPTURE_TYPES,
    limit: MAX_OBSERVATIONS,
  })
  if (fetched.length === 0) {
    return errorJson(
      422,
      'Sin observaciones para derivar',
      'Subí capturas (WhatsApp, Instagram, LinkedIn) o notas de esta persona y reintentá.',
    )
  }

  // Filtrar fuentes dudosas (descartadas, confianza baja/media).
  const observations = selectDerivableObservations(fetched)
  if (observations.length === 0) {
    return errorJson(
      422,
      'Las capturas disponibles no son confiables para derivar',
      'Todas las capturas de esta persona quedaron descartadas o con baja confianza de lectura. Volvé a capturar con imágenes más nítidas (las secciones del perfil, no la página entera) y reintentá.',
    )
  }

  // Partición: conversaciones (se RE-DERIVAN siempre) vs perfiles/notas
  // (idempotentes: se saltan si ya están cubiertos).
  const conversationObs = observations.filter((o) => isConversationCapture(o.captureType))
  const otherObs = observations.filter((o) => !isConversationCapture(o.captureType))

  // Cobertura de los NO-conversación (idempotencia barata vía el PK índice 0).
  let alreadyCovered = 0
  let otherUncovered: Observation[] = []
  if (otherObs.length > 0) {
    const probeIds = otherObs.map((o) => derivedMemoryId(o.id, 0))
    const { data: existing, error: existingErr } = await supabase
      .from('memories')
      .select('id')
      .eq('user_id', userId)
      .in('id', probeIds)
    if (existingErr) {
      return errorJson(500, 'No se pudo leer memorias existentes', existingErr.message)
    }
    const covered = new Set<string>()
    for (const r of existing ?? []) {
      const obsId = observationIdFromMemoryId((r as { id: string }).id)
      if (obsId) covered.add(obsId)
    }
    alreadyCovered = covered.size
    otherUncovered = selectUncoveredObservations(otherObs, covered)
  }

  // Para el refresh de conversaciones: índices reservados (descartes a NO
  // resucitar) + ids vivos a reemplazar.
  const { reservedByObs, liveIdsByObs } = await fetchExistingDerived(
    supabase,
    userId,
    conversationObs.map((o) => o.id),
  )

  const toProcess = [...conversationObs, ...otherUncovered]
  if (toProcess.length === 0) {
    return NextResponse.json(
      { generated: 0, inserted: 0, skipped: 0, alreadyCovered, usedLlm: false, refreshed: 0 },
      { status: 200 },
    )
  }

  const now = new Date()
  const conversationIds = new Set(conversationObs.map((o) => o.id))

  // Síntesis con Anthropic; fallback determinístico si falla / vacío.
  let memories = [] as ReturnType<typeof baseMemoriesFromObservations>
  let usedLlm = false
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ maxRetries: 2 })
      const msg = await client.messages.create({
        model: MODEL_ID,
        max_tokens: 3500,
        system: DERIVE_MEMORIES_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildDeriveInput(personName, digestObservations(toProcess, now), goalContext),
          },
        ],
      })
      const textBlock = msg.content.find((b) => b.type === 'text')
      const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
      const items = parseDeriveResponse(text)
      if (items.length > 0) {
        memories = memoriesFromLlmItems(personName, toProcess, items, {
          // Conversaciones admiten más señales que un perfil/nota.
          maxPerObservation: (obs) => (isConversationCapture(obs.captureType) ? MAX_MEMORIES_PER_CONVERSATION : 2),
          reservedIndices: reservedByObs,
        })
        usedLlm = true
      }
    } catch {
      // Silencioso: caemos al fallback determinístico abajo.
    }
  }

  // Fallback: 1 memoria base por observation (determinístico).
  if (memories.length === 0) {
    memories = baseMemoriesFromObservations(personName, toProcess)
  }

  const rows = memories.map((m) => derivedMemoryToRow(m, userId))

  // Refresh de conversaciones: borrar las memorias derivadas VIVAS de las
  // conversaciones que SÍ produjeron memorias nuevas (no tocamos las que no
  // generaron nada, ni los descartes del usuario). Reemplazo limpio, sin
  // duplicar y respetando los tombstones.
  const refreshedObs = new Set<string>()
  for (const m of memories) {
    const obsId = observationIdFromMemoryId(m.id)
    if (obsId && conversationIds.has(obsId)) refreshedObs.add(obsId)
  }
  const idsToDelete: string[] = []
  for (const obsId of refreshedObs) {
    for (const id of liveIdsByObs.get(obsId) ?? []) idsToDelete.push(id)
  }
  let refreshed = 0
  if (idsToDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('memories')
      .delete()
      .eq('user_id', userId)
      .in('id', idsToDelete)
    if (delErr) {
      return errorJson(500, 'No se pudieron reemplazar las memorias previas', delErr.message)
    }
    refreshed = idsToDelete.length
  }

  // Idempotencia por PRIMARY KEY: ON CONFLICT (id) DO NOTHING. Tras borrar las
  // vivas, las nuevas entran limpio; los tombstones siguen protegidos.
  const { data: inserted, error: upsertErr } = await supabase
    .from('memories')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    .select('id')
  if (upsertErr) {
    return errorJson(500, 'No se pudieron guardar las memorias', upsertErr.message)
  }

  const insertedCount = inserted?.length ?? 0
  return NextResponse.json(
    {
      generated: memories.length,
      inserted: insertedCount,
      skipped: memories.length - insertedCount,
      alreadyCovered,
      usedLlm,
      refreshed,
    },
    { status: 200 },
  )
}
