// SIR V2 — POST /api/person-briefing (#16 "Briefing IA" del detail page)
//
// Genera un briefing EFÍMERO (no se persiste) sobre una persona usando el
// LLM sobre sus memorias asociadas + metadata del vínculo.
//
// Body JSON: { person_id: string }
// Response 200: { briefing: string }
//
// Flujo (mismo scaffolding que /api/person-synthesis):
//   1. Auth + person ownership (404 si ajena).
//   2. getMemoriesForPerson (RLS + user_id). 422 si 0 memorias.
//   3. Anthropic Sonnet 4.5. 500 si falta ANTHROPIC_API_KEY.
//   4. Devolver el texto. NO se escribe a DB (briefing es transitorio).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import {
  BRIEFING_SYSTEM_PROMPT,
  buildBriefingInput,
  type BriefingMemory,
} from '@/lib/person-briefing/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_MEMORIES = 60

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

  // Person ownership + facts para el prompt.
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id, name, relationship, category, last_contact, importance_score, energy_impact')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) {
    return errorJson(500, 'No se pudo verificar la persona', personErr.message)
  }
  if (!personRow) {
    return errorJson(404, 'Persona no encontrada o sin permiso')
  }

  const memories = await getMemoriesForPerson(supabase, userId, personId, { limit: MAX_MEMORIES })
  if (memories.length === 0) {
    return errorJson(
      422,
      'Sin memorias para el briefing',
      'Generá memorias primero (botón en "Memorias asociadas") o registrá conversaciones.',
    )
  }
  const briefingMemories: BriefingMemory[] = memories.map((m) => ({
    type: m.type,
    content: m.content,
    timestamp: m.timestamp,
  }))

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })

  let text = ''
  try {
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 600,
      system: BRIEFING_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildBriefingInput(
            {
              name: (personRow.name as string) ?? 'esta persona',
              relationship: (personRow.relationship as string) ?? 'desconocido',
              category: (personRow.category as string) ?? 'desconocido',
              lastContact: (personRow.last_contact as string | null) ?? null,
              importanceScore:
                personRow.importance_score !== null && personRow.importance_score !== undefined
                  ? Number(personRow.importance_score)
                  : undefined,
              energyImpact: (personRow.energy_impact as string) ?? undefined,
            },
            briefingMemories,
          ),
        },
      ],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
  } catch (e) {
    reportApiError(e)
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo de briefing', m.slice(0, 300))
  }
  if (!text) {
    return errorJson(502, 'El modelo devolvió un briefing vacío')
  }

  return NextResponse.json({ briefing: text }, { status: 200 })
}
