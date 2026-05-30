// SIR V2 — POST /api/capture/process
//
// Endpoint que cierra el flujo de captura iniciado por POST /api/capture:
//
//   1. Llama al extractor especifico segun capture_type (Vision)
//   2. Sube el screenshot al bucket correspondiente
//   3. Inserta un row en observations (atomico salvo crash post-upload)
//
// Recibe FormData:
//   - file               : Blob con la imagen comprimida (igual que /api/capture)
//   - capture_type       : 'whatsapp_chat' | 'whatsapp_info' | 'instagram' | 'linkedin'
//   - detector_data?     : JSON string con el DetectorResult ya conocido
//                          (cuando vino del detector). Si no se manda, se guarda null.
//   - person_id?         : ID de la persona a vincular (slug-id de people).
//   - reflection?        : 'true' | 'false' (solo aplica a whatsapp_chat)
//
// Respuesta 200: { observation: Observation, extracted: {...}, raw: string }
//
// Auth: requiere sesion activa.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getExtractorSpec } from '@/lib/capture/extractors'
import { isValidDetectorResult } from '@/lib/capture/detector/validate'
import { insertObservation } from '@/lib/capture/observations/insert'
import { deriveObservedAt } from '@/lib/capture/observations/observed-at'
import { signalsFromExtracted } from '@/lib/capture/observations/extract-signals'
import { findCandidates, type ScoredCandidate } from '@/lib/people/matcher'
import {
  storageBucketFor,
  type CaptureType,
  type Confidence,
  type DetectorResult,
} from '@/lib/capture/observations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EXTRACTOR_MODEL_ID = 'claude-sonnet-4-5-20250929'
const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_FILE_BYTES = 10 * 1024 * 1024
const VALID_CAPTURE_TYPES_WITH_EXTRACTOR: ReadonlySet<CaptureType> = new Set([
  'whatsapp_chat',
  'whatsapp_info',
  'instagram',
  'linkedin',
])

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

async function blobToBase64(file: Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  return Buffer.from(arrayBuffer).toString('base64')
}

async function callExtractorVision(
  client: Anthropic,
  systemPrompt: string,
  imageBase64: string,
  mediaType: 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif',
  maxTokens: number,
  systemExtra: string = '',
): Promise<string> {
  const system = systemExtra ? `${systemPrompt}\n\n${systemExtra}` : systemPrompt
  const msg = await client.messages.create({
    model: EXTRACTOR_MODEL_ID,
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Extraer.' },
        ],
      },
    ],
  })
  const textBlock = msg.content.find((b) => b.type === 'text')
  return textBlock && textBlock.type === 'text' ? textBlock.text : ''
}

function bucketSlugFor(captureType: CaptureType): string {
  switch (captureType) {
    case 'whatsapp_chat':
      return 'whatsapp-chat'
    case 'whatsapp_info':
      return 'whatsapp-info'
    case 'instagram':
      return 'instagram'
    case 'linkedin':
      return 'linkedin'
    default:
      return captureType
  }
}

function buildStoragePath(userId: string, captureType: CaptureType): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 10)
  return `${userId}/${bucketSlugFor(captureType)}/${ts}-${rand}.webp`
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  // 2. Parse FormData
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return errorJson(400, 'FormData inválido en el body')
  }

  const file = formData.get('file')
  const captureTypeRaw = formData.get('capture_type')
  const detectorDataRaw = formData.get('detector_data')
  const personIdRaw = formData.get('person_id')
  const reflectionRaw = formData.get('reflection')

  if (!(file instanceof Blob)) {
    return errorJson(400, 'Body invalido', 'Se esperaba un campo "file" con un Blob.')
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorJson(413, 'Imagen demasiado grande', `Máx ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return errorJson(415, 'Tipo de imagen no soportado', `mimeType=${file.type || '(vacio)'}.`)
  }

  if (typeof captureTypeRaw !== 'string' || captureTypeRaw.length === 0) {
    return errorJson(400, 'Falta capture_type')
  }
  if (!VALID_CAPTURE_TYPES_WITH_EXTRACTOR.has(captureTypeRaw as CaptureType)) {
    return errorJson(
      400,
      'capture_type no soportado por /process',
      `Tipos validos: ${Array.from(VALID_CAPTURE_TYPES_WITH_EXTRACTOR).join(', ')}. Recibido: ${captureTypeRaw}`,
    )
  }
  const captureType = captureTypeRaw as CaptureType

  // detector_data opcional
  let detectorData: DetectorResult | null = null
  if (typeof detectorDataRaw === 'string' && detectorDataRaw.length > 0) {
    try {
      const parsed = JSON.parse(detectorDataRaw)
      if (isValidDetectorResult(parsed)) {
        detectorData = parsed
      } else {
        return errorJson(400, 'detector_data invalido', 'No cumple el schema DetectorResult')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(400, 'detector_data no es JSON valido', msg.slice(0, 200))
    }
  }

  const personId =
    typeof personIdRaw === 'string' && personIdRaw.length > 0 ? personIdRaw : null

  const reflection = reflectionRaw === 'true' || reflectionRaw === '1'

  // 3. Extractor dispatch
  const spec = getExtractorSpec(captureType)
  if (!spec) {
    return errorJson(500, 'Extractor no implementado para este tipo')
  }
  const systemPrompt = spec.getSystemPrompt({ reflection })

  // 4. Anthropic client + Vision call
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })

  const mediaType = file.type as 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
  const imageBase64 = await blobToBase64(file)

  let raw = ''
  try {
    raw = await callExtractorVision(client, systemPrompt, imageBase64, mediaType, spec.maxTokens)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada Vision al extractor', msg.slice(0, 300))
  }

  // 5. Parse + validate
  let parsed: unknown = null
  try {
    parsed = JSON.parse(stripJsonFences(raw))
  } catch {
    try {
      raw = await callExtractorVision(
        client,
        systemPrompt,
        imageBase64,
        mediaType,
        spec.maxTokens,
        'CRÍTICO: tu respuesta anterior no era JSON valido. Devolvé SOLO el JSON, sin texto adicional, sin markdown fences. Empezá la respuesta con `{` y terminá con `}`.',
      )
      parsed = JSON.parse(stripJsonFences(raw))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Extractor devolvio JSON invalido', msg.slice(0, 200))
    }
  }

  if (!spec.isValid(parsed)) {
    return errorJson(
      422,
      'JSON del extractor no cumple el schema esperado',
      JSON.stringify(parsed).slice(0, 300),
    )
  }

  const extracted = spec.sanitize(parsed)

  // 6. Upload a Storage
  const bucket = storageBucketFor(captureType)
  if (!bucket) {
    // Defensive: no deberia pasar para los 4 tipos validados antes.
    return errorJson(500, 'No hay bucket asignado a este capture_type')
  }
  const storagePath = buildStoragePath(userId, captureType)
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, {
      contentType: mediaType,
      upsert: false,
    })
  if (uploadError) {
    return errorJson(
      502,
      'No se pudo subir la imagen al bucket',
      `${bucket}: ${uploadError.message}`,
    )
  }

  // 7. Confidence consolidada (extractor manda; cae al detector si falta)
  const extractedConfidence =
    typeof (extracted as { confidence?: unknown }).confidence === 'string'
      ? ((extracted as { confidence: Confidence }).confidence)
      : null
  const confidence: Confidence | null =
    extractedConfidence ?? detectorData?.confidence ?? null

  // 8. observed_at
  const observedAt = deriveObservedAt(captureType, extracted)

  // 9. Matcher post-extraccion (BUG-002, Sesion 2.7)
  //    Si el cliente NO mando un person_id, corremos el matcher con los
  //    campos autoritativos del extractor (mucha mejor señal que el
  //    suggestedPersonName del detector que viene de imagen agresiva).
  //    Auto-link SOLO si el matcher reporta exact handle/URL/phone.
  //    Matches por nombre -> devolvemos candidatos para que el usuario
  //    elija en la UI, jamas auto-link.
  let finalPersonId: string | null = personId
  let matchCandidates: ScoredCandidate[] = []
  let autoLinked: { personId: string; reason: string } | null = null
  if (!finalPersonId) {
    const signals = signalsFromExtracted(captureType, extracted)
    const matcher = await findCandidates(supabase, userId, signals)
    matchCandidates = matcher.candidates
    if (matcher.autoLink) {
      finalPersonId = matcher.autoLink.personId
      autoLinked = matcher.autoLink
    }
  }

  // 10. Insert observation (rollback de storage si falla)
  try {
    const observation = await insertObservation(supabase, {
      userId,
      personId: finalPersonId,
      captureType,
      sourceImagePath: storagePath,
      storageBucket: bucket,
      data: extracted,
      detectorData,
      confidence,
      observedAt,
      needsReview: confidence === 'low',
    })
    return NextResponse.json(
      { observation, extracted, raw, matchCandidates, autoLinked },
      { status: 200 },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Best-effort rollback del upload
    await supabase.storage.from(bucket).remove([storagePath]).catch(() => {})
    return errorJson(500, 'No se pudo persistir observation', msg.slice(0, 300))
  }
}
