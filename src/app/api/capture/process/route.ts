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
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { getExtractorSpec } from '@/lib/capture/extractors'
import { isValidDetectorResult } from '@/lib/capture/detector/validate'
import { insertObservation } from '@/lib/capture/observations/insert'
import { deriveObservedAt } from '@/lib/capture/observations/observed-at'
import { signalsFromExtracted } from '@/lib/capture/observations/extract-signals'
import { findCandidates, type ScoredCandidate } from '@/lib/people/matcher'
import { computeProfessionalAxis, computeSocialAxis } from '@/lib/person-axes/compute'
import { upsertAxisAuto } from '@/lib/person-axes/upsert'
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
  'whatsapp_web',
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

// Modo TEXTO PEGADO: en vez de una imagen, el usuario pegó el texto del perfil
// (copy/paste). El texto es EXACTO (no es OCR) → extracción confiable, sin el
// problema de las capturas ilegibles. Reusa el MISMO system prompt del
// extractor + este recordatorio de que la fuente es texto fiel.
const TEXT_INPUT_EXTRA = `MODO TEXTO PEGADO (la fuente NO es una imagen):
En vez de una captura, el usuario PEGÓ el TEXTO del perfil (copiado del navegador o la app). El texto es EXACTO y fiel — NO es OCR, no hay píxeles que adivinar. Reglas:
- Extraé los campos del texto LITERAL. Mantené la regla anti-invención: si un dato no está en el texto, va null. Pero NO bajes la confianza por "imagen ilegible/borrosa": acá no hay imagen.
- Como el texto es fiel, usá confidence='high' salvo que el texto esté realmente incompleto o no parezca un perfil.
- Si el esquema pide imageLegible, devolvé true (no hubo imagen que leer mal).
- El texto puede traer ruido de UI (botones "Seguir"/"Mensaje", menús, "ver más", contadores, "· 3.º"). Ignorá el ruido y quedate con los datos del perfil.`

const MAX_TEXT_CHARS = 20_000
const MIN_TEXT_CHARS = 12

async function callExtractorText(
  client: Anthropic,
  systemPrompt: string,
  profileText: string,
  maxTokens: number,
  systemExtra: string = '',
): Promise<string> {
  const base = `${systemPrompt}\n\n${TEXT_INPUT_EXTRA}`
  const system = systemExtra ? `${base}\n\n${systemExtra}` : base
  const msg = await client.messages.create({
    model: EXTRACTOR_MODEL_ID,
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: `PERFIL (texto pegado):\n\n${profileText}` }],
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
    case 'whatsapp_web':
      return 'whatsapp-web'
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

/**
 * Recomputa y persiste el eje narrativo (profesional|social) de la ficha tras
 * una captura LinkedIn/Instagram (GEMA 2). DETERMINÍSTICO (sin LLM). NUNCA
 * lanza: traga cualquier error (incluida la tabla 0047 sin migrar) para no
 * afectar la captura ya persistida. La síntesis se computa "al capturar" — no
 * en cada carga — evitando el riesgo de timeout/502 en el render.
 */
/** Empleador actual desde la extracción de LinkedIn: currentCompany (del
 *  headline) o, si falta, la empresa del trabajo más reciente (workHistory[0]).
 *  null si no hay nada legible. Puro. */
function employerFromLinkedIn(extracted: Record<string, unknown>): string | null {
  const cc = extracted.currentCompany
  if (typeof cc === 'string' && cc.trim().length > 0) return cc.trim().slice(0, 160)
  const wh = extracted.workHistory
  if (Array.isArray(wh) && wh.length > 0) {
    const first = wh[0] as Record<string, unknown> | null
    const name = first && typeof first.name === 'string' ? first.name.trim() : ''
    if (name.length > 0) return name.slice(0, 160)
  }
  return null
}

async function persistAxisBestEffort(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  personId: string,
  captureType: 'linkedin' | 'instagram',
  extracted: Record<string, unknown>,
  observationId: string,
): Promise<void> {
  try {
    if (captureType === 'linkedin') {
      // El eje profesional reconcilia educación con el campo people.education.
      const { data: personRow } = await supabase
        .from('people')
        .select('education, organization')
        .eq('user_id', userId)
        .eq('id', personId)
        .maybeSingle()
      const education = (personRow?.education as string | null) ?? null
      const text = computeProfessionalAxis(extracted, education)
      await upsertAxisAuto(supabase, userId, personId, 'professional', text, observationId)

      // Empresa/empleador: del headline (currentCompany) o del trabajo más
      // reciente (workHistory[0]). RELLENA SOLO SI ESTÁ VACÍO — nunca pisa lo
      // que Aaron escribió a mano. El grupo/holding se resuelve en lectura vía
      // orgRegistry (no se persiste acá). Best-effort.
      const existingOrg = (personRow?.organization as string | null) ?? null
      if (!existingOrg || existingOrg.trim().length === 0) {
        const employer = employerFromLinkedIn(extracted)
        if (employer) {
          await supabase
            .from('people')
            .update({ organization: employer })
            .eq('user_id', userId)
            .eq('id', personId)
        }
      }
    } else {
      const text = computeSocialAxis(extracted)
      await upsertAxisAuto(supabase, userId, personId, 'social', text, observationId)
    }
  } catch (e) {
    // Best-effort: log y seguir. La ficha cae al cómputo en vivo si no se persistió.
    reportApiError(e)
  }
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
  const textRaw = formData.get('text')
  const captureTypeRaw = formData.get('capture_type')
  const detectorDataRaw = formData.get('detector_data')
  const personIdRaw = formData.get('person_id')
  const reflectionRaw = formData.get('reflection')

  // Modo TEXTO PEGADO: si vino `text` (y no un file), saltamos Visión y
  // Storage. El texto es la vía CONFIABLE (sin OCR ilegible).
  const isTextMode =
    !(file instanceof Blob) && typeof textRaw === 'string' && textRaw.trim().length > 0
  const profileText = isTextMode ? (textRaw as string).trim() : ''

  // Rate limit: la vía texto pega al bucket 'generation' (es un completion de
  // texto, no Visión); la vía imagen al bucket 'vision'.
  const rl = await enforceRateLimit(supabase, userId, isTextMode ? 'generation' : 'vision')
  if (!rl.ok) return rl.response

  if (isTextMode) {
    if (profileText.length < MIN_TEXT_CHARS) {
      return errorJson(400, 'Texto demasiado corto', `Pegá el texto del perfil (mín ${MIN_TEXT_CHARS} caracteres).`)
    }
    if (profileText.length > MAX_TEXT_CHARS) {
      return errorJson(413, 'Texto demasiado largo', `Máx ${MAX_TEXT_CHARS} caracteres.`)
    }
  } else {
    if (!(file instanceof Blob)) {
      return errorJson(400, 'Body invalido', 'Se esperaba un campo "file" (Blob) o "text" (string).')
    }
    if (file.size > MAX_FILE_BYTES) {
      return errorJson(413, 'Imagen demasiado grande', `Máx ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return errorJson(415, 'Tipo de imagen no soportado', `mimeType=${file.type || '(vacio)'}.`)
    }
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

  // persist=false → modo PREVIEW: extrae pero NO sube/inserta (review-before-save).
  // confirmed_data → el usuario ya revisó; usamos esos datos y SALTAMOS Vision.
  // Defaults preservan el comportamiento previo (persist=true, sin confirmed_data).
  const persist = formData.get('persist') !== 'false'
  const confirmedDataRaw = formData.get('confirmed_data')
  const isConfirmed = typeof confirmedDataRaw === 'string' && confirmedDataRaw.length > 0

  // 3. Extractor dispatch
  const spec = getExtractorSpec(captureType)
  if (!spec) {
    return errorJson(500, 'Extractor no implementado para este tipo')
  }
  const systemPrompt = spec.getSystemPrompt({ reflection })

  // 4. Obtener `extracted`: o de confirmed_data (usuario ya revisó → SALTAMOS
  //    Vision para guardar EXACTAMENTE lo revisado, sin re-extraer no-determinista)
  //    o corriendo Vision sobre la imagen.
  const mediaType = isTextMode
    ? null
    : ((file as Blob).type as 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif')
  const RETRY_EXTRA =
    'CRÍTICO: tu respuesta anterior no era JSON valido. Devolvé SOLO el JSON, sin texto adicional, sin markdown fences. Empezá la respuesta con `{` y terminá con `}`.'
  let raw = ''
  let parsed: unknown = null

  if (isConfirmed) {
    try {
      parsed = JSON.parse(confirmedDataRaw as string)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(400, 'confirmed_data no es JSON válido', msg.slice(0, 200))
    }
    raw = '(confirmado por el usuario)'
  } else if (isTextMode) {
    // Vía TEXTO: structuramos el texto pegado con el MISMO extractor (sin Visión).
    if (!process.env.ANTHROPIC_API_KEY) {
      return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
    }
    const client = new Anthropic({ maxRetries: 2 })
    try {
      raw = await callExtractorText(client, systemPrompt, profileText, spec.maxTokens)
    } catch (e) {
      reportApiError(e)
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Falló la extracción del texto', msg.slice(0, 300))
    }
    try {
      parsed = JSON.parse(stripJsonFences(raw))
    } catch {
      try {
        raw = await callExtractorText(client, systemPrompt, profileText, spec.maxTokens, RETRY_EXTRA)
        parsed = JSON.parse(stripJsonFences(raw))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return errorJson(502, 'Extractor devolvio JSON invalido', msg.slice(0, 200))
      }
    }
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
    }
    const client = new Anthropic({ maxRetries: 2 })
    const imageBase64 = await blobToBase64(file as Blob)

    try {
      raw = await callExtractorVision(client, systemPrompt, imageBase64, mediaType!, spec.maxTokens)
    } catch (e) {
      reportApiError(e)
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Falló la llamada Vision al extractor', msg.slice(0, 300))
    }

    // 5. Parse + validate (1 retry si el JSON sale mal)
    try {
      parsed = JSON.parse(stripJsonFences(raw))
    } catch {
      try {
        raw = await callExtractorVision(client, systemPrompt, imageBase64, mediaType!, spec.maxTokens, RETRY_EXTRA)
        parsed = JSON.parse(stripJsonFences(raw))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return errorJson(502, 'Extractor devolvio JSON invalido', msg.slice(0, 200))
      }
    }
  }

  if (!spec.isValid(parsed)) {
    return errorJson(
      422,
      isConfirmed ? 'confirmed_data no cumple el schema esperado' : 'JSON del extractor no cumple el schema esperado',
      JSON.stringify(parsed).slice(0, 300),
    )
  }

  const extracted = spec.sanitize(parsed)

  // Confidence consolidada (extractor manda; cae al detector si falta).
  const extractedConfidence =
    typeof (extracted as { confidence?: unknown }).confidence === 'string'
      ? ((extracted as { confidence: Confidence }).confidence)
      : null
  const confidence: Confidence | null =
    extractedConfidence ?? detectorData?.confidence ?? null

  // 5b. PREVIEW: si persist=false, devolvemos lo extraído para que el usuario
  //     lo revise ANTES de guardar. NO subimos imagen ni insertamos nada.
  if (!persist) {
    return NextResponse.json(
      { preview: true, extracted, confidence, captureType, raw },
      { status: 200 },
    )
  }

  // 6. Upload a Storage (SOLO vía imagen). En modo texto no hay imagen:
  //    source_image_path/storage_bucket quedan null.
  let sourceImagePath: string | null = null
  let storageBucket: string | null = null
  if (!isTextMode) {
    const bucket = storageBucketFor(captureType)
    if (!bucket) {
      // Defensive: no deberia pasar para los 4 tipos validados antes.
      return errorJson(500, 'No hay bucket asignado a este capture_type')
    }
    const storagePath = buildStoragePath(userId, captureType)
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file as Blob, {
        contentType: mediaType!,
        upsert: false,
      })
    if (uploadError) {
      return errorJson(
        502,
        'No se pudo subir la imagen al bucket',
        `${bucket}: ${uploadError.message}`,
      )
    }
    sourceImagePath = storagePath
    storageBucket = bucket
  }

  // 8. observed_at (confidence ya se computó arriba, antes del preview)
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
      sourceImagePath,
      storageBucket,
      data: extracted,
      detectorData,
      confidence,
      observedAt,
      // Confirmado por el usuario → ya revisado (no needs_review). Sin confirmar
      // → flag para confianza baja, como antes.
      needsReview: isConfirmed ? false : confidence === 'low',
    })

    // 10b. Persistir el eje narrativo (profesional|social) de la ficha (GEMA 2,
    //      person_profile_axes 0047). DETERMINÍSTICO (sin LLM) → cero latencia /
    //      sin riesgo de 502. Best-effort TOTAL: cualquier fallo (tabla aún sin
    //      migrar, etc.) se traga y NO afecta la captura ya persistida.
    if (finalPersonId && (captureType === 'linkedin' || captureType === 'instagram')) {
      await persistAxisBestEffort(supabase, userId, finalPersonId, captureType, extracted, observation.id)
    }

    return NextResponse.json(
      { observation, extracted, raw, matchCandidates, autoLinked },
      { status: 200 },
    )
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : String(e)
    // Best-effort rollback del upload (solo si subimos algo).
    if (storageBucket && sourceImagePath) {
      await supabase.storage.from(storageBucket).remove([sourceImagePath]).catch(() => {})
    }
    return errorJson(500, 'No se pudo persistir observation', msg.slice(0, 300))
  }
}
