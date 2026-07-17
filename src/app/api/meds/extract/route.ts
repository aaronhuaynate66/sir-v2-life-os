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

import { complete, LlmError, type LlmContentBlock } from '@/lib/llm'
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

const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_BASE64_BYTES = 8 * 1024 * 1024

type MediaType = 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
type Supabase = Awaited<ReturnType<typeof createClient>>

interface ErrBody { error: string; detail?: string }
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrBody> {
  return NextResponse.json({ error, detail }, { status })
}

function stripJsonFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}

// Vía capa llm/. tier cheap → Haiku (mismo modelo). sensitivity self (medicación
// del propio Aaron). Acepta imagen (caja) o texto (nombre/link).
async function callModel(
  supabase: Supabase,
  userId: string,
  input: { imageBase64: string; mediaType: MediaType } | { text: string },
  systemExtra = '',
): Promise<string> {
  const system = systemExtra ? `${MED_EXTRACT_SYSTEM_PROMPT}\n\n${systemExtra}` : MED_EXTRACT_SYSTEM_PROMPT
  const content: LlmContentBlock[] =
    'imageBase64' in input
      ? [
          { type: 'image', source: { type: 'base64', mediaType: input.mediaType, data: input.imageBase64 } },
          { type: 'text', text: 'Extraé el desglose del medicamento de la caja en la imagen.' },
        ]
      : [{ type: 'text', text: `Producto (nombre o link de farmacia):\n${input.text}\n\nExtraé el desglose.` }]
  const res = await complete(
    { task: 'meds_extract', tier: 'cheap', sensitivity: 'self', maxTokens: 700, system, messages: [{ role: 'user', content }] },
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

  let raw = ''
  try {
    raw = await callModel(supabase, authData.user.id, input)
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') {
      return errorJson(500, 'No hay proveedor LLM configurado en el server')
    }
    return errorJson(502, 'Falló la llamada al modelo', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let parsed: unknown = null
  try { parsed = JSON.parse(stripJsonFences(raw)) } catch { parsed = null }
  if (!isValidMedExtracted(parsed)) {
    try {
      raw = await callModel(supabase, authData.user.id, input, 'CRÍTICO: tu respuesta anterior no era JSON válido. Devuelve SOLO el JSON, empezando con { y terminando con }.')
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
