// SIR V2 — POST /api/capture/hrv
// Recibe { imageBase64, mimeType }, llama Claude Vision con el prompt de VFC,
// parsea/valida/sanitiza y devuelve HrvPanelExtracted. Espeja /api/capture/hr.

import { complete, LlmError } from '@/lib/llm'
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

const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_BASE64_BYTES = 8 * 1024 * 1024

type Supabase = Awaited<ReturnType<typeof createClient>>

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

// Vía capa llm/ (router + fallback + telemetría). tier cheap → Haiku (mismo
// modelo que antes). sensitivity self.
async function callVision(
  supabase: Supabase,
  userId: string,
  imageBase64: string,
  mediaType: 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif',
  systemExtra = '',
): Promise<string> {
  const system = systemExtra ? `${HRV_VISION_SYSTEM_PROMPT}\n\n${systemExtra}` : HRV_VISION_SYSTEM_PROMPT
  const res = await complete(
    {
      task: 'capture_hrv', tier: 'cheap', sensitivity: 'self',
      system, maxTokens: 1200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', mediaType, data: imageBase64 } },
          { type: 'text', text: 'Extraer los datos de VFC (ms) del panel de la imagen.' },
        ],
      }],
    },
    { supabase, userId },
  )
  return res.text
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')

  const rl = await enforceRateLimit(supabase, authData.user.id, 'vision')
  if (!rl.ok) return rl.response

  let body: unknown
  try { body = await req.json() } catch { return errorJson(400, 'JSON inválido en el body') }
  if (!isPostBody(body)) return errorJson(400, 'Body invalido', 'Se esperaba { imageBase64, mimeType }')
  const { imageBase64, mimeType } = body
  if (!ALLOWED_MIME.has(mimeType)) return errorJson(415, 'Tipo de imagen no soportado', `mimeType=${mimeType}`)
  if (imageBase64.length > MAX_BASE64_BYTES) return errorJson(413, 'Imagen demasiado grande (max ~6 MB)')

  const mediaType = mimeType as 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
  let raw = ''
  try {
    raw = await callVision(supabase, authData.user.id, imageBase64, mediaType)
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') {
      return errorJson(500, 'No hay proveedor LLM configurado en el server')
    }
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada a Claude Vision', msg.slice(0, 300))
  }

  let parsed: unknown = null
  let parseError: string | null = null
  try { parsed = JSON.parse(stripJsonFences(raw)) } catch { parseError = 'parse-1' }

  if (parseError || !isValidHrvPanelExtracted(parsed)) {
    try {
      raw = await callVision(supabase, authData.user.id, imageBase64, mediaType,
        'CRÍTICO: tu respuesta anterior no era JSON válido. Devuelve SOLO el JSON, sin texto adicional, sin markdown fences.')
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
