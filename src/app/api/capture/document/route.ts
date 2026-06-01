// SIR V2 — POST /api/capture/document
//
// Extracción PUNTUAL por visión de un documento de identidad (DNI peruano /
// CE / pasaporte). Recibe { imageBase64, mimeType }, llama a Claude Vision UNA
// vez (con 1 retry si el JSON sale mal), valida, y devuelve los campos. NO
// escribe en la base, NO crea observation (los documentos NUNCA se materializan
// como observations → nunca entran al timeline/memory/grafo). El cliente
// persiste en person_sensitive_data vía PUT /api/person-sensitive.
//
// REGLA SENSIBLE: la llamada de visión es el mecanismo permitido (extracción
// puntual). NO logueamos los valores. NO se indexan en embeddings/summaries.
//
// Mismo patrón que /api/capture/scale (auth + rate-limit vision + parse/retry).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { DOCUMENT_VISION_SYSTEM_PROMPT } from '@/lib/capture/document/prompt'
import { isValidDocumentRaw, sanitizeDocumentExtracted } from '@/lib/capture/document/validate'
import type { DocumentCaptureError } from '@/lib/capture/document/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-sonnet-4-5-20250929' // números/fechas → precisión sobre costo
const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_BASE64_BYTES = 8 * 1024 * 1024

function errorJson(status: number, error: string, detail?: string): NextResponse<DocumentCaptureError> {
  return NextResponse.json({ error, detail }, { status })
}

interface PostBody {
  imageBase64: string
  mimeType: string
}

function isPostBody(x: unknown): x is PostBody {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.imageBase64 === 'string' && typeof o.mimeType === 'string'
}

function stripJsonFences(s: string): string {
  const trimmed = s.trim()
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }
  return trimmed
}

async function callVision(
  client: Anthropic,
  imageBase64: string,
  mediaType: 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif',
  systemExtra = '',
): Promise<string> {
  const system = systemExtra
    ? `${DOCUMENT_VISION_SYSTEM_PROMPT}\n\n${systemExtra}`
    : DOCUMENT_VISION_SYSTEM_PROMPT
  const msg = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 500,
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Extraé los datos del documento.' },
        ],
      },
    ],
  })
  const textBlock = msg.content.find((b) => b.type === 'text')
  return textBlock && textBlock.type === 'text' ? textBlock.text : ''
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'vision')
  if (!rl.ok) return rl.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorJson(400, 'JSON inválido en el body')
  }
  if (!isPostBody(body)) {
    return errorJson(400, 'Body inválido', 'Se esperaba { imageBase64, mimeType }')
  }
  const { imageBase64, mimeType } = body
  if (!ALLOWED_MIME.has(mimeType)) {
    return errorJson(415, 'Tipo de imagen no soportado', `mimeType=${mimeType}`)
  }
  if (imageBase64.length > MAX_BASE64_BYTES) {
    return errorJson(413, 'Imagen demasiado grande (max ~6 MB)')
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })
  const mediaType = mimeType as 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'

  let raw = ''
  try {
    raw = await callVision(client, imageBase64, mediaType)
  } catch (e) {
    reportApiError(e) // captura la excepción, NUNCA la imagen ni los valores
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada a Claude Vision', msg.slice(0, 300))
  }

  let parsed: unknown = null
  let parseError = false
  try {
    parsed = JSON.parse(stripJsonFences(raw))
  } catch {
    parseError = true
  }

  if (parseError || !isValidDocumentRaw(parsed)) {
    try {
      raw = await callVision(
        client,
        imageBase64,
        mediaType,
        'CRÍTICO: tu respuesta anterior no era JSON válido. Devolvé SOLO el JSON del schema, sin texto adicional, sin markdown fences. Empezá con `{` y terminá con `}`.',
      )
      parsed = JSON.parse(stripJsonFences(raw))
    } catch {
      return errorJson(502, 'Claude Vision devolvió un formato inválido')
    }
    if (!isValidDocumentRaw(parsed)) {
      return errorJson(502, 'Claude Vision devolvió un JSON que no cumple el schema')
    }
  }

  // No logueamos `parsed` (valores sensibles). Sanitizamos y devolvemos.
  return NextResponse.json(sanitizeDocumentExtracted(parsed), { status: 200 })
}
