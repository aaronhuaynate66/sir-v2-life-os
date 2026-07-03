// SIR V2 — POST /api/meds/extract
//
// Extrae el DESGLOSE de un medicamento a partir de:
//   - una FOTO de la caja  → { imageBase64, mimeType }  (Claude Vision)
//   - un NOMBRE o LINK      → { text }                    (Claude, por conocimiento)
//
// Devuelve una PROPUESTA EDITABLE (MedExtracted); NO guarda nada. El usuario
// revisa y confirma en /medicacion (anti-formulario-vacío). Mismo pipeline
// tolerante que /api/capture/hr (SDK con retries + 1 retry si el JSON falla).
//
// Auth: sesión activa de Supabase.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  MED_EXTRACT_SYSTEM_PROMPT,
  isValidMedExtracted,
  sanitizeMedExtracted,
  type MedExtracted,
} from '@/lib/meds/extract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-haiku-4-5-20251001'
const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_BASE64_BYTES = 8 * 1024 * 1024

type MediaType = 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'

interface ErrBody { error: string; detail?: string }
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrBody> {
  return NextResponse.json({ error, detail }, { status })
}

function stripJsonFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}

async function callModel(
  client: Anthropic,
  input: { imageBase64: string; mediaType: MediaType } | { text: string },
  systemExtra = '',
): Promise<string> {
  const system = systemExtra ? `${MED_EXTRACT_SYSTEM_PROMPT}\n\n${systemExtra}` : MED_EXTRACT_SYSTEM_PROMPT
  const content: Anthropic.MessageParam['content'] =
    'imageBase64' in input
      ? [
          { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.imageBase64 } },
          { type: 'text', text: 'Extraé el desglose del medicamento de la caja en la imagen.' },
        ]
      : [{ type: 'text', text: `Producto (nombre o link de farmacia):\n${input.text}\n\nExtraé el desglose.` }]
  const msg = await client.messages.create({ model: MODEL_ID, max_tokens: 700, system, messages: [{ role: 'user', content }] })
  const block = msg.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  const rl = await enforceRateLimit(supabase, authData.user.id, 'vision')
  if (!rl.ok) return rl.response

  let body: { imageBase64?: unknown; mimeType?: unknown; text?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido en el body') }

  // Modo imagen o modo texto.
  let input: { imageBase64: string; mediaType: MediaType } | { text: string }
  if (typeof body.imageBase64 === 'string' && body.imageBase64) {
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
    if (!ALLOWED_MIME.has(mimeType)) return errorJson(415, 'Tipo de imagen no soportado', `mimeType=${mimeType}`)
    if (body.imageBase64.length > MAX_BASE64_BYTES) return errorJson(413, 'Imagen demasiado grande (max ~6 MB)')
    input = { imageBase64: body.imageBase64, mediaType: mimeType as MediaType }
  } else if (typeof body.text === 'string' && body.text.trim()) {
    input = { text: body.text.trim().slice(0, 400) }
  } else {
    return errorJson(400, 'Body inválido', 'Se esperaba { imageBase64, mimeType } o { text }')
  }

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })

  let raw = ''
  try {
    raw = await callModel(client, input)
  } catch (e) {
    reportApiError(e)
    return errorJson(502, 'Falló la llamada a Claude', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let parsed: unknown = null
  try { parsed = JSON.parse(stripJsonFences(raw)) } catch { parsed = null }
  if (!isValidMedExtracted(parsed)) {
    try {
      raw = await callModel(client, input, 'CRÍTICO: tu respuesta anterior no era JSON válido. Devolvé SOLO el JSON, empezando con { y terminando con }.')
      parsed = JSON.parse(stripJsonFences(raw))
    } catch (e) {
      return errorJson(502, 'Claude devolvió formato inválido', (e instanceof Error ? e.message : String(e)).slice(0, 200))
    }
    if (!isValidMedExtracted(parsed)) {
      return errorJson(502, 'No pude extraer el desglose de eso', JSON.stringify(parsed).slice(0, 200))
    }
  }

  const clean: MedExtracted = sanitizeMedExtracted(parsed)
  return NextResponse.json(clean, { status: 200 })
}
