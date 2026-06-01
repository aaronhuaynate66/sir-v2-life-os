// SIR V2 — POST /api/capture/whatsapp
//
// Recibe FormData { file, reflection } y devuelve WhatsAppCaptureExtracted
// del modelo Claude Sonnet 4.5 Vision.
//
// Auth: requiere sesion activa (cookies Supabase via @/lib/supabase/server).
// Modelo: claude-sonnet-4-5-20250929. Si la API lo rechaza, REPORTAR al
// usuario antes de cambiar a Haiku.
//
// El upload a Storage NO ocurre acá — el flujo replica scale: extraer
// primero, persistir solo cuando el usuario confirma (Step 4).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { getSystemPrompt } from '@/lib/capture/whatsapp/prompt'
import { isValidWhatsAppCaptureExtracted, sanitizeExtracted } from '@/lib/capture/whatsapp/validate'
import type { WhatsAppCaptureError, WhatsAppCaptureExtracted } from '@/lib/capture/whatsapp/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45 // Sonnet con interpretacion emocional puede tardar mas

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

function errorJson(status: number, error: string, detail?: string): NextResponse<WhatsAppCaptureError> {
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

async function callVision(
  client: Anthropic,
  imageBase64: string,
  mediaType: 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif',
  reflection: boolean,
  systemExtra: string = '',
): Promise<string> {
  const baseSystem = getSystemPrompt(reflection)
  const system = systemExtra ? `${baseSystem}\n\n${systemExtra}` : baseSystem
  const msg = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 2000,
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

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  // 2. Parse FormData
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return errorJson(400, 'FormData inválido en el body')
  }

  const file = formData.get('file')
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

  const reflection = reflectionRaw === 'true' || reflectionRaw === '1'

  // 3. Anthropic client
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })

  // 4. base64 + llamada Vision
  const mediaType = file.type as 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
  const imageBase64 = await blobToBase64(file)

  let raw = ''
  try {
    raw = await callVision(client, imageBase64, mediaType, reflection)
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : String(e)
    // Si el modelo no existe (404 o "model not found"), devolver 502 con detalle
    // para que el cliente reporte al usuario claramente.
    const status =
      msg.toLowerCase().includes('model') && msg.toLowerCase().includes('not found') ? 502 : 502
    return errorJson(status, 'Falló la llamada a Claude Vision', msg.slice(0, 300))
  }

  // 5. Parse JSON con retry si invalido
  let parsed: unknown = null
  try {
    parsed = JSON.parse(stripJsonFences(raw))
  } catch {
    // Retry con instruccion extra
    try {
      raw = await callVision(
        client,
        imageBase64,
        mediaType,
        reflection,
        'CRÍTICO: tu respuesta anterior no era JSON valido. Devolvé SOLO el JSON, sin texto adicional, sin markdown fences. Empezá la respuesta con `{` y terminá con `}`.',
      )
      parsed = JSON.parse(stripJsonFences(raw))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Claude Vision devolvio formato invalido', msg.slice(0, 200))
    }
  }

  // 6. Validar schema
  if (!isValidWhatsAppCaptureExtracted(parsed)) {
    return errorJson(
      422,
      'JSON de Vision no cumple el schema esperado',
      JSON.stringify(parsed).slice(0, 300),
    )
  }

  // 7. Sanitizar + responder
  const clean: WhatsAppCaptureExtracted = sanitizeExtracted(parsed)
  return NextResponse.json(clean, { status: 200 })
}
