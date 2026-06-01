// SIR V2 — POST /api/capture (detector universal)
//
// Endpoint generico de captura. Recibe FormData { file, capture_type_hint? }
// y devuelve UN DetectorResult identificando que tipo de screenshot es.
//
// En Sesion 1 esto es SOLO el detector — no sube a Storage, no llama
// extractor especifico, no inserta observation. Esas piezas vienen en
// Sesion 2.
//
// Auth: requiere sesion activa (cookies Supabase).
// Modelo detector: claude-sonnet-4-5-20250929 (D3 confirmado).
//
// Coexiste con /api/capture/whatsapp y /api/capture/scale — esos siguen
// funcionando sin cambios (paths tipados son atajos que saltan el detector).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { DETECTOR_SYSTEM_PROMPT } from '@/lib/capture/detector/prompt'
import { isValidDetectorResult, sanitizeDetectorResult } from '@/lib/capture/detector/validate'
import type {
  CaptureDetectError,
  CaptureDetectResponse,
  CaptureType,
  DetectorResult,
} from '@/lib/capture/observations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const DETECTOR_MODEL_ID = 'claude-sonnet-4-5-20250929'
const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const VALID_TYPE_HINTS: ReadonlySet<CaptureType> = new Set<CaptureType>([
  'whatsapp_chat',
  'whatsapp_web',
  'whatsapp_info',
  'instagram',
  'linkedin',
  'scale',
  'manual_note',
  'voice_note',
  'unknown',
])

function errorJson(status: number, error: string, detail?: string): NextResponse<CaptureDetectError> {
  return NextResponse.json({ error, detail }, { status })
}

function stripJsonFences(s: string): string {
  const trimmed = s.trim()
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }
  return trimmed
}

async function blobToBase64(file: Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  return Buffer.from(arrayBuffer).toString('base64')
}

async function callDetectorVision(
  client: Anthropic,
  imageBase64: string,
  mediaType: 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif',
  systemExtra: string = '',
): Promise<string> {
  const system = systemExtra
    ? `${DETECTOR_SYSTEM_PROMPT}\n\n${systemExtra}`
    : DETECTOR_SYSTEM_PROMPT
  const msg = await client.messages.create({
    model: DETECTOR_MODEL_ID,
    max_tokens: 300, // detector output es chiquito (<200 tokens normales)
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Clasificar.' },
        ],
      },
    ],
  })
  const textBlock = msg.content.find((b) => b.type === 'text')
  return textBlock && textBlock.type === 'text' ? textBlock.text : ''
}

/** Atajo cuando el cliente sabe el tipo de antemano (skip detector). */
function hintToDetectorResult(hint: CaptureType): DetectorResult {
  return {
    type: hint,
    confidence: 'high',
    reasoning: `capture_type_hint provisto por el cliente (${hint})`,
    suggestedPersonName: null,
  }
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

  // 2. Parse FormData
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return errorJson(400, 'FormData inválido en el body')
  }

  const file = formData.get('file')
  const hintRaw = formData.get('capture_type_hint')

  if (!(file instanceof Blob)) {
    return errorJson(400, 'Body inválido', 'Se esperaba un campo "file" con un Blob.')
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorJson(413, 'Imagen demasiado grande', `Máx ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return errorJson(415, 'Tipo de imagen no soportado', `mimeType=${file.type || '(vacio)'}.`)
  }

  // 3. Capture type hint shortcut
  if (typeof hintRaw === 'string' && hintRaw.length > 0) {
    if (!VALID_TYPE_HINTS.has(hintRaw as CaptureType)) {
      return errorJson(400, 'capture_type_hint inválido', `Valor recibido: ${hintRaw}`)
    }
    const detected = hintToDetectorResult(hintRaw as CaptureType)
    const response: CaptureDetectResponse = { detected, raw: '(hint)' }
    return NextResponse.json(response, { status: 200 })
  }

  // 4. Anthropic client + detector
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })

  const mediaType = file.type as 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
  const imageBase64 = await blobToBase64(file)

  let raw = ''
  try {
    raw = await callDetectorVision(client, imageBase64, mediaType)
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al detector Vision', msg.slice(0, 300))
  }

  // 5. Parse JSON con retry
  let parsed: unknown = null
  try {
    parsed = JSON.parse(stripJsonFences(raw))
  } catch {
    try {
      raw = await callDetectorVision(
        client,
        imageBase64,
        mediaType,
        'CRÍTICO: tu respuesta anterior no era JSON valido. Devolvé SOLO el JSON, sin texto adicional, sin markdown fences. Empezá la respuesta con `{` y terminá con `}`.',
      )
      parsed = JSON.parse(stripJsonFences(raw))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Detector Vision devolvio formato invalido', msg.slice(0, 200))
    }
  }

  // 6. Validar schema
  if (!isValidDetectorResult(parsed)) {
    return errorJson(
      422,
      'JSON del detector no cumple el schema esperado',
      JSON.stringify(parsed).slice(0, 300),
    )
  }

  // 7. Sanitize + responder
  const detected = sanitizeDetectorResult(parsed)
  const response: CaptureDetectResponse = { detected, raw }
  return NextResponse.json(response, { status: 200 })
}
