// SIR V2 — POST /api/capture/hr
//
// Recibe { imageBase64, mimeType } del cliente, llama a Claude Vision con el
// system prompt de captura de panel de frecuencia cardíaca, parsea el JSON de
// respuesta, valida + sanitiza, y devuelve HeartRatePanelExtracted al cliente.
//
// Mismo pipeline tolerante que /api/capture/scale y /api/capture/sleep: SDK con
// retries para 5xx/429 + 1 retry manual si el JSON parse falla, con instrucción
// extra.
//
// Auth: requiere sesión activa de Supabase (vía cookies).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { HR_VISION_SYSTEM_PROMPT } from '@/lib/capture/hr/prompt'
import {
  isValidHeartRatePanelExtracted,
  sanitizeHeartRatePanelExtracted,
} from '@/lib/capture/hr/validate'
import type { HeartRateCaptureError, HeartRatePanelExtracted } from '@/lib/capture/hr/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-haiku-4-5-20251001'
const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_BASE64_BYTES = 8 * 1024 * 1024 // ~6 MB de imagen decodificada — overprovision

function errorJson(status: number, error: string, detail?: string): NextResponse<HeartRateCaptureError> {
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
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
  }
  return trimmed
}

async function callVision(
  client: Anthropic,
  imageBase64: string,
  mediaType: 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif',
  systemExtra: string = '',
): Promise<string> {
  const system = systemExtra
    ? `${HR_VISION_SYSTEM_PROMPT}\n\n${systemExtra}`
    : HR_VISION_SYSTEM_PROMPT
  const msg = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1500,
    system,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          { type: 'text', text: 'Extraer los datos de frecuencia cardíaca del panel de la imagen.' },
        ],
      },
    ],
  })
  const textBlock = msg.content.find((b) => b.type === 'text')
  return textBlock && textBlock.type === 'text' ? textBlock.text : ''
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'vision')
  if (!rl.ok) return rl.response

  // 2. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorJson(400, 'JSON inválido en el body')
  }
  if (!isPostBody(body)) {
    return errorJson(400, 'Body invalido', 'Se esperaba { imageBase64, mimeType }')
  }
  const { imageBase64, mimeType } = body
  if (!ALLOWED_MIME.has(mimeType)) {
    return errorJson(415, 'Tipo de imagen no soportado', `mimeType=${mimeType}`)
  }
  if (imageBase64.length > MAX_BASE64_BYTES) {
    return errorJson(413, 'Imagen demasiado grande (max ~6 MB)')
  }

  // 3. Anthropic client (lee ANTHROPIC_API_KEY del entorno)
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 }) // SDK retries transient 5xx/429

  // 4. Llamada Vision + parse del JSON
  const mediaType = mimeType as 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
  let raw = ''
  try {
    raw = await callVision(client, imageBase64, mediaType)
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada a Claude Vision', msg.slice(0, 300))
  }

  // 5. Intentar parsear. Si falla, 1 retry con system prompt extra.
  let parsed: unknown = null
  let parseError: string | null = null
  try {
    parsed = JSON.parse(stripJsonFences(raw))
  } catch {
    parseError = 'parse-1'
  }

  if (parseError || !isValidHeartRatePanelExtracted(parsed)) {
    try {
      raw = await callVision(
        client,
        imageBase64,
        mediaType,
        'CRÍTICO: tu respuesta anterior no era JSON válido. Devolvé SOLO el JSON, sin texto adicional, sin markdown fences. Empezá la respuesta con `{` y terminá con `}`.',
      )
      parsed = JSON.parse(stripJsonFences(raw))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Claude Vision devolvió formato inválido', msg.slice(0, 200))
    }
    if (!isValidHeartRatePanelExtracted(parsed)) {
      return errorJson(
        502,
        'Claude Vision devolvió un JSON que no cumple el schema',
        JSON.stringify(parsed).slice(0, 300),
      )
    }
  }

  // 6. Sanitizar + responder
  const clean: HeartRatePanelExtracted = sanitizeHeartRatePanelExtracted(
    parsed as HeartRatePanelExtracted,
  )
  return NextResponse.json(clean, { status: 200 })
}
