// SIR V2 — POST /api/contradiction-flag (flag "⚠ contradice una nota").
//
// EFÍMERO (no se persiste, patrón /api/person-briefing): cruza las notas
// manuales de una persona (people.notes + relational_notes + observaciones
// manual_note) contra el HILO REAL del sustrato (chat_messages, mig 0141) y
// devuelve las contradicciones detectadas, con el porqué y una cita. NO pisa
// la nota.
//
// Body JSON: { person_id: string }
// Response 200: { findings: ContradictionFinding[], notes: NotePayload[], msgCount }
//
// Flujo (mismo scaffolding que /api/person-synthesis):
//   1. Auth + rate limit + person ownership (404 si ajena).
//   2. Reunir notas manuales (3 fuentes). 422 si no hay ninguna.
//   3. Leer el sustrato (chat_messages). 422 si hay muy poco hilo.
//   4. Anthropic Sonnet 4.5. 500 si falta ANTHROPIC_API_KEY.
//   5. Parsear findings (puro) y devolver + eco de las notas para la UI.
//
// NUNCA lee person_sensitive_data (aislada de la IA por diseño).

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'

import { reportApiError } from '@/lib/observability/reportApiError'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { fetchChatMessages } from '@/lib/chat-messages/read'
import { getObservationsForPerson } from '@/lib/observations/fetch'
import { parseRelationalNotes } from '@/lib/people/relationalNotes'
import {
  CONTRADICTION_SYSTEM,
  buildTranscript,
  buildContradictionInput,
  parseContradictionFindings,
  NOTE_SOURCE_LABEL,
  type ManualNote,
  type ManualNoteSource,
} from '@/lib/contradiction-flag/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

/** Ventana reciente del sustrato que leemos para la muestra del transcript. */
const SUBSTRATE_SAMPLE = 3000
/** Debajo de esto, no hay hilo suficiente para juzgar contradicciones. */
const MIN_SUBSTRATE_MSGS = 30
/** Notas manuales fechadas: cuántas de las más recientes considerar. */
const MAX_DATED_NOTES = 30

interface ErrorBody {
  error: string
  detail?: string
}

/** Eco de una nota al cliente, para mostrar qué se contradijo. */
interface NotePayload {
  ref: number
  source: ManualNoteSource
  sourceLabel: string
  text: string
  date?: string | null
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
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

  // 1. Ownership + notas de la ficha (people.notes + relational_notes).
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id, name, notes, relational_notes')
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

  // 2. Reunir las notas manuales de las 3 fuentes con un ref estable.
  const notes: ManualNote[] = []
  const pushNote = (source: ManualNoteSource, text: string, date?: string | null) => {
    const t = (text ?? '').trim()
    if (t) notes.push({ ref: notes.length, source, text: t, date: date ?? null })
  }

  // 2a. people.notes ("quién es") — puede traer varias líneas; una nota por bloque.
  const profileNotes = typeof personRow.notes === 'string' ? personRow.notes.trim() : ''
  if (profileNotes) pushNote('perfil', profileNotes)

  // 2b. relational_notes (fricción / fortalezas / metas).
  const rel = parseRelationalNotes(personRow.relational_notes)
  for (const t of rel.tensions) pushNote('friccion', t)
  for (const t of rel.strengths) pushNote('fortaleza', t)
  for (const t of rel.sharedGoals) pushNote('meta', t)

  // 2c. observaciones manual_note (notas fechadas de "Anotar algo ahora").
  const noteObs = await getObservationsForPerson(supabase, userId, personId, {
    captureType: 'manual_note',
    limit: MAX_DATED_NOTES,
  })
  for (const o of noteObs) {
    const text = typeof o.data?.text === 'string' ? (o.data.text as string) : ''
    pushNote('nota_fechada', text, o.observedAt ? o.observedAt.slice(0, 10) : null)
  }

  if (notes.length === 0) {
    return errorJson(
      422,
      'Sin notas manuales para contrastar',
      'Agrega una nota (perfil, fricción/fortalezas, o "Anotar algo ahora") y vuelve a revisar.',
    )
  }

  // 3. Sustrato — el hilo real. Sin hilo suficiente no hay contra qué contrastar.
  const subRows = await fetchChatMessages(supabase, userId, personId, SUBSTRATE_SAMPLE)
  if (subRows.length < MIN_SUBSTRATE_MSGS) {
    return errorJson(
      422,
      'Falta conversación para contrastar',
      'Subí el export de WhatsApp de esta persona (o espera a que el sustrato tenga su hilo) y vuelve a revisar.',
    )
  }
  const transcript = buildTranscript(subRows, personName)

  // 4. LLM — vía capa llm/ (router + fallback + telemetría en ai_usage). tier
  //    balanced: contraste notas↔hilo de un tercero → sensitivity third_party.
  let text = ''
  try {
    const res = await complete(
      {
        task: 'contradiction_flag', tier: 'balanced', sensitivity: 'third_party', maxTokens: 1200,
        system: CONTRADICTION_SYSTEM,
        messages: [
          { role: 'user', content: buildContradictionInput(personName, notes, transcript, subRows.length) },
        ],
      },
      { supabase, userId },
    )
    text = res.text.trim()
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') return errorJson(500, 'No hay proveedor LLM configurado en el server')
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo', m.slice(0, 300))
  }

  // 5. Parsear (puro) contra los refs válidos + eco de las notas para la UI.
  const validRefs = new Set(notes.map((n) => n.ref))
  const findings = parseContradictionFindings(text, validRefs)
  const notePayloads: NotePayload[] = notes.map((n) => ({
    ref: n.ref,
    source: n.source,
    sourceLabel: NOTE_SOURCE_LABEL[n.source],
    text: n.text,
    date: n.date,
  }))

  return NextResponse.json(
    { findings, notes: notePayloads, msgCount: subRows.length },
    { status: 200 },
  )
}
