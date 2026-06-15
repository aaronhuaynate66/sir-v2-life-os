// SIR V2 — POST /api/capture/hrv
// Recibe { imageBase64, mimeType }, llama Claude Vision con el prompt de VFC,
// parsea/valida/sanitiza y devuelve HrvPanelExtracted. Espeja /api/capture/hr.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { HRV_VISION_SYSTEM_PROMPT } from '@/lib/capture/hrv/prompt'
import { isValidHrvPanelExtracted, sanitizeHrvPanelExtracted } from '@/lib/capture/hrv/validate'
import type { HrvCaptureError, HrvPanelExtracted } from '@/lib/capture/hrv/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-haiku-4-5-20251001'
const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_BASE64_BYTES = 8 * 1024 * 1024

function errorJson(status: number, error: string, detail?: string): NextResponse<HrvCaptureError> {
  return NextResponse.json({ error, detail }, { status })
}

interface PostBody { imageBase64: string; mimeType: string }
function isPostBody(x: unknown): x is PostBody {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.imageBase64 === 'string' && typeof o.mimeType === 'string'
}
function stripJsonFences(s: string): string {
  const t = s.trim()
  if (t.startsWith('```')) return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  return t
}

async function callVision(
  client: Anthropic,
  imageBase64: string,
  mediaType: 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif',
  systemExtra = '',
): Promise<string> {
  const system = systemExtra ? `${HRV_VISION_SYSTEM_PROMPT}\n\n${systemExtra}` : HRV_VISION_SYSTEM_PROMPT
  const msg = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1200,
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: 'Extraer los datos de VFC (ms) del panel de la imagen.' },
      ],
    }],
  })
  const tb = msg.content.find((b) => b.type === 'text')
  return tb && tb.type === 'text' ? tb.text : ''
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  const rl = await enforceRateLimit(supabase, authData.user.id, 'vision')
  if (!rl.ok) return rl.response

  let body: unknown
  try { body = await req.json() } catch { return errorJson(400, 'JSON inválido en el body') }
  if (!isPostBody(body)) return errorJson(400, 'Body invalido', 'Se esperaba { imageBase64, mimeType }')
  const { imageBase64, mimeType } = body
  if (!ALLOWED_MIME.has(mimeType)) return errorJson(415, 'Tipo de imagen no soportado', `mimeType=${mimeType}`)
  if (imageBase64.length > MAX_BASE64_BYTES) return errorJson(413, 'Imagen demasiado grande (max ~6 MB)')

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })

  const mediaType = mimeType as 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
  let raw = ''
  try {
    raw = await callVision(client, imageBase64, mediaType)
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada a Claude Vision', msg.slice(0, 300))
  }

  let parsed: unknown = null
  let parseError: string | null = null
  try { parsed = JSON.parse(stripJsonFences(raw)) } catch { parseError = 'parse-1' }

  if (parseError || !isValidHrvPanelExtracted(parsed)) {
    try {
      raw = await callVision(client, imageBase64, mediaType,
        'CRÍTICO: tu respuesta anterior no era JSON válido. Devolvé SOLO el JSON, sin texto adicional, sin markdown fences.')
      parsed = JSON.parse(stripJsonFences(raw))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Claude Vision devolvió formato inválido', msg.slice(0, 200))
    }
    if (!isValidHrvPanelExtracted(parsed)) {
      return errorJson(502, 'Claude Vision devolvió un JSON que no cumple el schema', JSON.stringify(parsed).slice(0, 300))
    }
  }

  const clean: HrvPanelExtracted = sanitizeHrvPanelExtracted(parsed as HrvPanelExtracted)
  return NextResponse.json(clean, { status: 200 })
}
