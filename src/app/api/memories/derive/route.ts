// SIR V2 — POST /api/memories/derive (camino ADITIVO: observations → memories)
//
// Materializa memorias en la tabla `memories` a partir de las observations
// curadas de una persona, usando Anthropic para la síntesis (fallback
// determinístico si el modelo falla o no devuelve nada parseable).
//
// NO toca el flujo viejo: /captura/whatsapp, relationships.history y el
// backfill 0012 siguen intactos. Idempotente vía el PRIMARY KEY `id`
// (determinístico `mem_obs:<observationId>:<n>`, existe desde 0001) →
// upsert ON CONFLICT (id) DO NOTHING. NO depende de source_event_id
// (esa columna de 0012 no existe en prod; ver fix 7b3249d).
//
// Body JSON: { person_id: string }
// Response 200: { generated, inserted, skipped, alreadyCovered, usedLlm }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getObservationsForPerson } from '@/lib/observations/fetch'
import {
  QUALIFYING_CAPTURE_TYPES,
  derivedMemoryId,
  observationIdFromMemoryId,
  selectUncoveredObservations,
  digestObservations,
  baseMemoriesFromObservations,
  memoriesFromLlmItems,
  derivedMemoryToRow,
} from '@/lib/memories/deriveFromObservations'
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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
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

  // Observations curadas que califican (conversaciones + perfiles + notas).
  const observations = await getObservationsForPerson(supabase, userId, personId, {
    captureType: QUALIFYING_CAPTURE_TYPES,
    limit: MAX_OBSERVATIONS,
  })
  if (observations.length === 0) {
    return errorJson(
      422,
      'Sin observaciones para derivar',
      'Subí capturas (WhatsApp, Instagram, LinkedIn) o notas de esta persona y reintentá.',
    )
  }

  // Idempotencia barata: saltar las observations ya derivadas. Anclamos en
  // el PRIMARY KEY (siempre existe): probamos el id de índice 0 de cada
  // observation; si está, esa observation ya fue derivada.
  const probeIds = observations.map((o) => derivedMemoryId(o.id, 0))
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
  const uncovered = selectUncoveredObservations(observations, covered)

  if (uncovered.length === 0) {
    return NextResponse.json(
      {
        generated: 0,
        inserted: 0,
        skipped: 0,
        alreadyCovered: covered.size,
        usedLlm: false,
      },
      { status: 200 },
    )
  }

  // Síntesis con Anthropic; fallback determinístico si falla / vacío.
  let memories = [] as ReturnType<typeof baseMemoriesFromObservations>
  let usedLlm = false
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ maxRetries: 2 })
      const msg = await client.messages.create({
        model: MODEL_ID,
        max_tokens: 1500,
        system: DERIVE_MEMORIES_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: buildDeriveInput(personName, digestObservations(uncovered)) },
        ],
      })
      const textBlock = msg.content.find((b) => b.type === 'text')
      const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
      const items = parseDeriveResponse(text)
      if (items.length > 0) {
        memories = memoriesFromLlmItems(personName, uncovered, items)
        usedLlm = true
      }
    } catch {
      // Silencioso: caemos al fallback determinístico abajo.
    }
  }

  // Fallback: 1 memoria base por observation (determinístico).
  if (memories.length === 0) {
    memories = baseMemoriesFromObservations(personName, uncovered)
  }

  const rows = memories.map((m) => derivedMemoryToRow(m, userId))

  // Idempotencia por PRIMARY KEY (siempre existe): ON CONFLICT (id) DO
  // NOTHING. Re-derivar la misma observation no duplica.
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
      alreadyCovered: covered.size,
      usedLlm,
    },
    { status: 200 },
  )
}
