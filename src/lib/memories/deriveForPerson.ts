// SIR V2 — deriveForPerson: lógica reutilizable de derivación observations → memories.
//
// Extraída de POST /api/memories/derive para que tanto la ruta por-persona como
// la ruta en lote (/api/memories/derive-all) compartan EXACTAMENTE la misma
// lógica (recencia + conciencia del objetivo, re-derivación de conversaciones,
// supresión por firma de privadas, idempotencia por PK). Sin cambios de
// comportamiento respecto del original; solo devuelve un resultado tipado en
// vez de NextResponse.

import Anthropic from '@anthropic-ai/sdk'

import type { createClient } from '@/lib/supabase/server'
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
  buildSuppressionIndex,
  suppressEquivalentToPrivate,
} from '@/lib/memories/deriveFromObservations'
import type { Observation } from '@/lib/capture/observations/types'
import {
  DERIVE_MEMORIES_SYSTEM_PROMPT,
  buildDeriveInput,
  parseDeriveResponse,
} from '@/lib/memories/derivePrompt'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_OBSERVATIONS = 30

export interface DeriveResult {
  generated: number
  inserted: number
  skipped: number
  alreadyCovered: number
  usedLlm: boolean
  refreshed: number
  suppressed: number
}

export type DeriveOutcome =
  | { ok: true; result: DeriveResult }
  | { ok: false; status: number; error: string; detail?: string }

interface ExistingDerived {
  reservedByObs: Map<string, Set<number>>
  liveIdsByObs: Map<string, string[]>
}

async function fetchExistingDerived(
  supabase: SupabaseClient,
  userId: string,
  observationIds: string[],
): Promise<ExistingDerived> {
  const reservedByObs = new Map<string, Set<number>>()
  const liveIdsByObs = new Map<string, string[]>()
  if (observationIds.length === 0) return { reservedByObs, liveIdsByObs }

  const build = (withObsolete: boolean, withPrivate: boolean) => {
    const cols = ['id', 'observation_id']
    if (withObsolete) cols.push('is_obsolete')
    if (withPrivate) cols.push('is_private')
    return supabase.from('memories').select(cols.join(', ')).eq('user_id', userId).in('observation_id', observationIds)
  }
  let hasObsoleteCol = true
  let hasPrivateCol = true
  let { data, error } = await build(true, true)
  if (error) {
    hasPrivateCol = false
    ;({ data, error } = await build(true, false))
  }
  if (error) {
    hasObsoleteCol = false
    ;({ data, error } = await build(false, false))
  }
  if (error || !data) return { reservedByObs, liveIdsByObs }

  for (const raw of data as unknown as Record<string, unknown>[]) {
    const id = raw.id as string
    const obsId = observationIdFromMemoryId(id)
    if (!obsId) continue
    const parsed = parseDerivedKey(id.slice(4))
    if (!parsed) continue
    const isObsolete = hasObsoleteCol && raw.is_obsolete === true
    const isPrivate = hasPrivateCol && raw.is_private === true
    if (isObsolete || isPrivate) {
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

async function fetchPrivateSuppressionItems(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
): Promise<{ content: string }[]> {
  const { data, error } = await supabase
    .from('memories')
    .select('content')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('is_private', true)
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[])
    .map((r) => ({ content: typeof r.content === 'string' ? r.content : '' }))
    .filter((it) => it.content.length > 0)
}

/** Deriva memorias para UNA persona. Devuelve un resultado tipado (ok/!ok) en
 *  lugar de NextResponse, para poder reusarse en lote. Asume que el caller ya
 *  resolvió auth + rate limit. */
export async function deriveForPerson(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
): Promise<DeriveOutcome> {
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id, name')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) {
    return { ok: false, status: 500, error: 'No se pudo verificar la persona', detail: personErr.message }
  }
  if (!personRow) {
    return { ok: false, status: 404, error: 'Persona no encontrada o sin permiso' }
  }
  const personName = (personRow.name as string) ?? 'esta persona'

  const goals = await getGoalsForPerson(supabase, userId, personId)
  const goalContext = buildGoalContext(goals)

  const fetched = await getObservationsForPerson(supabase, userId, personId, {
    captureType: QUALIFYING_CAPTURE_TYPES,
    limit: MAX_OBSERVATIONS,
  })
  if (fetched.length === 0) {
    return {
      ok: false,
      status: 422,
      error: 'Sin observaciones para derivar',
      detail: 'Subí capturas (WhatsApp, Instagram, LinkedIn) o notas de esta persona y reintentá.',
    }
  }

  const observations = selectDerivableObservations(fetched)
  if (observations.length === 0) {
    return {
      ok: false,
      status: 422,
      error: 'Las capturas disponibles no son confiables para derivar',
      detail:
        'Todas las capturas de esta persona quedaron descartadas o con baja confianza de lectura. Volvé a capturar con imágenes más nítidas (las secciones del perfil, no la página entera) y reintentá.',
    }
  }

  const conversationObs = observations.filter((o) => isConversationCapture(o.captureType))
  const otherObs = observations.filter((o) => !isConversationCapture(o.captureType))

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
      return { ok: false, status: 500, error: 'No se pudo leer memorias existentes', detail: existingErr.message }
    }
    const covered = new Set<string>()
    for (const r of existing ?? []) {
      const obsId = observationIdFromMemoryId((r as { id: string }).id)
      if (obsId) covered.add(obsId)
    }
    alreadyCovered = covered.size
    otherUncovered = selectUncoveredObservations(otherObs, covered)
  }

  const { reservedByObs, liveIdsByObs } = await fetchExistingDerived(
    supabase,
    userId,
    conversationObs.map((o) => o.id),
  )

  const privateItems = await fetchPrivateSuppressionItems(supabase, userId, personId)
  const suppressionIndex = buildSuppressionIndex(privateItems)

  const toProcess = [...conversationObs, ...otherUncovered]
  if (toProcess.length === 0) {
    return {
      ok: true,
      result: { generated: 0, inserted: 0, skipped: 0, alreadyCovered, usedLlm: false, refreshed: 0, suppressed: 0 },
    }
  }

  const now = new Date()
  const conversationIds = new Set(conversationObs.map((o) => o.id))

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
          maxPerObservation: (obs) => (isConversationCapture(obs.captureType) ? MAX_MEMORIES_PER_CONVERSATION : 2),
          reservedIndices: reservedByObs,
        })
        usedLlm = true
      }
    } catch {
      // Silencioso: caemos al fallback determinístico abajo.
    }
  }

  if (memories.length === 0) {
    memories = baseMemoriesFromObservations(personName, toProcess)
  }

  const { kept, suppressed } = suppressEquivalentToPrivate(memories, suppressionIndex)
  memories = kept

  const rows = memories.map((m) => derivedMemoryToRow(m, userId))

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
      return { ok: false, status: 500, error: 'No se pudieron reemplazar las memorias previas', detail: delErr.message }
    }
    refreshed = idsToDelete.length
  }

  const { data: inserted, error: upsertErr } = await supabase
    .from('memories')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    .select('id')
  if (upsertErr) {
    return { ok: false, status: 500, error: 'No se pudieron guardar las memorias', detail: upsertErr.message }
  }

  const insertedCount = inserted?.length ?? 0
  return {
    ok: true,
    result: {
      generated: memories.length,
      inserted: insertedCount,
      skipped: memories.length - insertedCount,
      alreadyCovered,
      usedLlm,
      refreshed,
      suppressed,
    },
  }
}
