// SIR V2 — POST /api/identity/capture
//
// AUTO-CAPTURA del perfil PROPIO: el usuario sube UN screenshot de SU propio
// LinkedIn/Instagram y Visión extrae sus anclas de identidad (roles, ubicación,
// skills, intereses, bio, trayectoria). NO persiste nada: devuelve lo extraído
// para que el cliente lo CONSOLIDE (varias imágenes) y lo muestre como PROPUESTA
// editable antes de guardar en identity_profile (vía el store local-first).
//
// Una llamada Vision por request (el cliente orquesta N imágenes con
// concurrencia acotada, igual que la captura multi-imagen de personas) →
// respeta maxDuration de Vercel, sin riesgo de timeout.
//
// Dos fuentes (misma extracción → mismo SelfProfileExtracted):
//   - { file: Blob }  → Visión sobre el screenshot (rate limit 'vision').
//   - { text: string }→ relato libre "cuéntale a SIR quién eres" (rate limit
//                       'generation'; sin OCR, texto fiel).
// Respuesta 200: { extracted, confidence }. Auth: requiere sesión activa.

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'

import { reportApiError } from '@/lib/observability/reportApiError'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { SELF_PROFILE_SYSTEM_PROMPT, SELF_PROFILE_TEXT_EXTRA } from '@/lib/capture/self-profile/prompt'
import {
  isValidSelfProfileExtracted,
  sanitizeSelfProfile,
} from '@/lib/capture/self-profile/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Generoso (como LinkedIn) para no truncar listas largas de skills/experiencia
// y evitar 502 por respuesta cortada.
const MAX_TOKENS = 1800
const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 20_000
const MIN_TEXT_CHARS = 12

type MediaType = 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
type Supabase = Awaited<ReturnType<typeof createClient>>

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

// Vía capa llm/. tier balanced → Sonnet (mismo modelo). sensitivity self: es el
// perfil PROPIO de Aaron.
async function callVision(
  supabase: Supabase,
  userId: string,
  imageBase64: string,
  mediaType: MediaType,
  systemExtra = '',
): Promise<string> {
  const system = systemExtra
    ? `${SELF_PROFILE_SYSTEM_PROMPT}\n\n${systemExtra}`
    : SELF_PROFILE_SYSTEM_PROMPT
  const res = await complete(
    {
      task: 'identity_capture', tier: 'balanced', sensitivity: 'self',
      system, maxTokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', mediaType, data: imageBase64 } },
            { type: 'text', text: 'Extraer.' },
          ],
        },
      ],
    },
    { supabase, userId },
  )
  return res.text
}

async function callText(
  supabase: Supabase,
  userId: string,
  profileText: string,
  systemExtra = '',
): Promise<string> {
  const base = `${SELF_PROFILE_SYSTEM_PROMPT}\n\n${SELF_PROFILE_TEXT_EXTRA}`
  const system = systemExtra ? `${base}\n\n${systemExtra}` : base
  const res = await complete(
    {
      task: 'identity_capture', tier: 'balanced', sensitivity: 'self',
      system, maxTokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: `RELATO DEL USUARIO (en sus palabras):\n\n${profileText}` }],
        },
      ],
    },
    { supabase, userId },
  )
  return res.text
}

const RETRY_EXTRA =
  'CRÍTICO: tu respuesta anterior no era JSON válido. Devuelve SOLO el JSON, sin texto adicional, sin markdown fences. Empieza con `{` y termina con `}`.'

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  }
  const userId = authData.user.id

  // 2. FormData
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return errorJson(400, 'FormData inválido en el body')
  }

  const file = formData.get('file')
  const textRaw = formData.get('text')

  // Modo: TEXTO (relato libre) si vino `text` y no un file; si no, IMAGEN.
  const isTextMode =
    !(file instanceof Blob) && typeof textRaw === 'string' && textRaw.trim().length > 0
  const profileText = isTextMode ? (textRaw as string).trim() : ''

  if (isTextMode) {
    if (profileText.length < MIN_TEXT_CHARS) {
      return errorJson(400, 'Cuéntanos un poco más', `Mín ${MIN_TEXT_CHARS} caracteres.`)
    }
    if (profileText.length > MAX_TEXT_CHARS) {
      return errorJson(413, 'Texto demasiado largo', `Máx ${MAX_TEXT_CHARS} caracteres.`)
    }
  } else {
    if (!(file instanceof Blob)) {
      return errorJson(400, 'Body inválido', 'Se esperaba un campo "file" (Blob) o "text" (string).')
    }
    if (file.size > MAX_FILE_BYTES) {
      return errorJson(413, 'Imagen demasiado grande', `Máx ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return errorJson(415, 'Tipo de imagen no soportado', `mimeType=${file.type || '(vacío)'}.`)
    }
  }

  // 3. Rate limit: texto → 'generation' (completion); imagen → 'vision'.
  const rl = await enforceRateLimit(supabase, userId, isTextMode ? 'generation' : 'vision')
  if (!rl.ok) return rl.response

  // 4. Extracción (1 retry si el JSON sale mal). La vía depende del modo.
  let raw = ''
  let parsed: unknown = null

  if (isTextMode) {
    try {
      raw = await callText(supabase, userId, profileText)
    } catch (e) {
      reportApiError(e)
      if (e instanceof LlmError && e.code === 'no_provider') {
        return errorJson(500, 'No hay proveedor LLM configurado en el server')
      }
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Falló la extracción del relato', msg.slice(0, 300))
    }
    try {
      parsed = JSON.parse(stripJsonFences(raw))
    } catch {
      try {
        raw = await callText(supabase, userId, profileText, RETRY_EXTRA)
        parsed = JSON.parse(stripJsonFences(raw))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return errorJson(502, 'El extractor devolvió JSON inválido', msg.slice(0, 200))
      }
    }
  } else {
    const imageBase64 = await blobToBase64(file as Blob)
    const mediaType = (file as Blob).type as MediaType
    try {
      raw = await callVision(supabase, userId, imageBase64, mediaType)
    } catch (e) {
      reportApiError(e)
      if (e instanceof LlmError && e.code === 'no_provider') {
        return errorJson(500, 'No hay proveedor LLM configurado en el server')
      }
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Falló la llamada Vision', msg.slice(0, 300))
    }
    try {
      parsed = JSON.parse(stripJsonFences(raw))
    } catch {
      try {
        raw = await callVision(supabase, userId, imageBase64, mediaType, RETRY_EXTRA)
        parsed = JSON.parse(stripJsonFences(raw))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return errorJson(502, 'El extractor devolvió JSON inválido', msg.slice(0, 200))
      }
    }
  }

  if (!isValidSelfProfileExtracted(parsed)) {
    return errorJson(
      422,
      'El JSON del extractor no cumple el schema esperado',
      JSON.stringify(parsed).slice(0, 300),
    )
  }

  const extracted = sanitizeSelfProfile(parsed)
  return NextResponse.json({ extracted, confidence: extracted.confidence }, { status: 200 })
}
