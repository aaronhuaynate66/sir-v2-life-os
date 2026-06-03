// SIR V2 — POST /api/capture/whatsapp-export/interpret
//
// Interpreta UN BLOQUE de la conversación exportada (orquestado desde el
// cliente, con progreso). Devuelve un ChunkInterpretation sanitizado. Una
// llamada LLM corta por bloque ⇒ NUNCA pega contra el maxDuration de Vercel ni
// contra el límite de tokens del modelo, por más larga que sea la charla.
//
// Body JSON: { chunk_text, person_name, index?, total? }
// Rate limit: bucket 'whatsapp_export' (alto: una acción intencional puede
// gatillar decenas de bloques legítimos).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  getInterpretSystemPrompt,
  buildInterpretUserMessage,
  sanitizeChunkInterpretation,
} from '@/lib/capture/whatsapp/export/interpret'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_CHUNK_CHARS = 120_000
const MIN_CHUNK_CHARS = 1

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

function stripJsonFences(s: string): string {
  const trimmed = s.trim()
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }
  return trimmed
}

interface PostBody {
  chunk_text?: unknown
  person_name?: unknown
}

async function callInterpret(
  client: Anthropic,
  system: string,
  userMsg: string,
  extra = '',
): Promise<string> {
  const sys = extra ? `${system}\n\n${extra}` : system
  const msg = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1500,
    system: sys,
    messages: [{ role: 'user', content: userMsg }],
  })
  const block = msg.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'whatsapp_export')
  if (!rl.ok) return rl.response

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }

  const chunkText = typeof body.chunk_text === 'string' ? body.chunk_text : ''
  if (chunkText.trim().length < MIN_CHUNK_CHARS) {
    return errorJson(400, 'Falta chunk_text', 'El bloque a interpretar está vacío.')
  }
  if (chunkText.length > MAX_CHUNK_CHARS) {
    return errorJson(413, 'Bloque demasiado grande', `Máx ${MAX_CHUNK_CHARS} caracteres por bloque.`)
  }
  const personName = typeof body.person_name === 'string' ? body.person_name : ''

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })
  const system = getInterpretSystemPrompt(personName)
  const userMsg = buildInterpretUserMessage(chunkText)

  let raw = ''
  try {
    raw = await callInterpret(client, system, userMsg)
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la interpretación del bloque', msg.slice(0, 300))
  }

  let parsed: unknown = null
  try {
    parsed = JSON.parse(stripJsonFences(raw))
  } catch {
    try {
      raw = await callInterpret(
        client,
        system,
        userMsg,
        'CRÍTICO: tu respuesta anterior no era JSON válido. Devolvé SOLO el JSON, sin texto ni markdown fences. Empezá con `{` y terminá con `}`.',
      )
      parsed = JSON.parse(stripJsonFences(raw))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'El modelo devolvió JSON inválido', msg.slice(0, 200))
    }
  }

  const interpretation = sanitizeChunkInterpretation(parsed)
  if (!interpretation) {
    return errorJson(422, 'La interpretación no cumple el formato esperado')
  }
  return NextResponse.json({ interpretation }, { status: 200 })
}
