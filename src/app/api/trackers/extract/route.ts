// SIR V2 — POST /api/trackers/extract
//
// Recibe { imageBase64, mimeType, hint? } del cliente, llama a Claude Vision con
// el prompt de extracción de tracker, parsea + valida + sanitiza, y devuelve
// TrackerExtracted. UNA imagen por request (la ingesta multi-pantallazo llama
// este endpoint una vez por imagen, con concurrencia acotada, igual que báscula
// / multi-imagen — respeta maxDuration de Vercel, cero riesgo de timeout).
//
// Auth: sesión activa de Supabase (cookies). Rate-limit 'vision'. Mismo patrón
// y manejo de errores que /api/capture/scale.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { TRACKER_VISION_SYSTEM_PROMPT, hintBlock } from '@/lib/trackers/extract/prompt'
import { isValidTrackerExtracted, sanitizeTrackerExtracted } from '@/lib/trackers/extract/validate'
import type { ExtractHint, TrackerExtracted, TrackerExtractError } from '@/lib/trackers/extract/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-haiku-4-5-20251001'
const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_BASE64_BYTES = 8 * 1024 * 1024 // ~6 MB de imagen decodificada

function errorJson(status: number, error: string, detail?: string): NextResponse<TrackerExtractError> {
  return NextResponse.json({ error, detail }, { status })
}

interface PostBody {
  imageBase64: string
  mimeType: string
  hint?: ExtractHint
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
  hint: ExtractHint | undefined,
  systemExtra = '',
): Promise<string> {
  const hb = hintBlock(hint)
  const system = [TRACKER_VISION_SYSTEM_PROMPT, hb, systemExtra].filter(Boolean).join('\n\n')
  const msg = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 800,
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Extraé la métrica numérica y su fecha de la imagen.' },
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
    return errorJson(400, 'Body inválido', 'Se esperaba { imageBase64, mimeType }')
  }
  const { imageBase64, mimeType, hint } = body
  if (!ALLOWED_MIME.has(mimeType)) {
    return errorJson(415, 'Tipo de imagen no soportado', `mimeType=${mimeType}`)
  }
  if (imageBase64.length > MAX_BASE64_BYTES) {
    return errorJson(413, 'Imagen demasiado grande (max ~6 MB)')
  }

  // 3. Anthropic client
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })
  const mediaType = mimeType as 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'

  // 4. Vision + parse
  let raw = ''
  try {
    raw = await callVision(client, imageBase64, mediaType, hint)
  } catch (e) {
    reportApiError(e)
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

  // 5. Retry con instrucción extra si falla parse/schema
  if (parseError || !isValidTrackerExtracted(parsed)) {
    try {
      raw = await callVision(
        client,
        imageBase64,
        mediaType,
        hint,
        'CRÍTICO: tu respuesta anterior no era JSON válido. Devolvé SOLO el JSON, sin texto adicional, sin markdown fences. Empezá con `{` y terminá con `}`.',
      )
      parsed = JSON.parse(stripJsonFences(raw))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Claude Vision devolvió formato inválido', msg.slice(0, 200))
    }
    if (!isValidTrackerExtracted(parsed)) {
      return errorJson(502, 'Claude Vision devolvió un JSON que no cumple el schema', JSON.stringify(parsed).slice(0, 300))
    }
  }

  // 6. Sanitizar + responder
  const clean: TrackerExtracted = sanitizeTrackerExtracted(parsed as TrackerExtracted)
  return NextResponse.json(clean, { status: 200 })
}
