// SIR V2 — POST /api/relato/transcribe
//
// Toma una FOTO (base64) que Aaron sacó desde "Cuéntale a SIR" y la transcribe a
// prosa con Claude Vision, para que ese texto caiga en el input del relato y el
// pipeline de siempre lo estructure (cumples, episodios, notas…). NO escribe en
// la base, NO crea observation: solo transcribe y devuelve texto (la foto se
// descarta, mismo espíritu que el adjunto de PDF).
//
// Body: { imageBase64, mimeType }. Response: { text } | { text: null } (sin datos).
// Session-auth + rate-limit 'vision' + 1 retry (mismo patrón que capture/document).

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { RELATO_TRANSCRIBE_SYSTEM_PROMPT, cleanTranscription } from '@/lib/relato/transcribePrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const MAX_BASE64_BYTES = 8 * 1024 * 1024

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

interface PostBody { imageBase64: string; mimeType: string }
function isPostBody(x: unknown): x is PostBody {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.imageBase64 === 'string' && typeof o.mimeType === 'string'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reintenta.')
  const userId = auth.user.id

  const rl = await enforceRateLimit(supabase, auth.user.id, 'vision')
  if (!rl.ok) return rl.response

  let body: unknown
  try { body = await req.json() } catch { return errorJson(400, 'JSON inválido') }
  if (!isPostBody(body)) return errorJson(400, 'Falta imageBase64 / mimeType')
  const mimeType = body.mimeType.toLowerCase()
  if (!ALLOWED_MIME.has(mimeType)) return errorJson(400, 'Formato no soportado', 'Usa JPG, PNG, WebP o GIF.')
  // El base64 crudo (sin data: prefix) no debe pasar el límite.
  const b64 = body.imageBase64.replace(/^data:[^;]+;base64,/, '')
  if (b64.length > MAX_BASE64_BYTES) return errorJson(413, 'Imagen muy grande', 'Prueba con una foto más chica.')

  // Vía capa llm/. tier balanced → Sonnet (fechas/nombres: precisión). self.
  const mediaType = mimeType as 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
  async function call(extra = ''): Promise<string> {
    const res = await complete(
      {
        task: 'relato_transcribe', tier: 'balanced', sensitivity: 'self', maxTokens: 1200,
        system: extra ? `${RELATO_TRANSCRIBE_SYSTEM_PROMPT}\n\n${extra}` : RELATO_TRANSCRIBE_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', mediaType, data: b64 } },
            { type: 'text', text: 'Transcribe a prosa todo dato útil de esta imagen.' },
          ],
        }],
      },
      { supabase, userId },
    )
    return res.text
  }

  let raw = ''
  try {
    raw = await call()
  } catch (e) {
    reportApiError(e, { route: 'relato/transcribe' })
    if (e instanceof LlmError && e.code === 'no_provider') {
      return errorJson(500, 'No hay proveedor LLM configurado en el server')
    }
    return errorJson(502, 'Falló la transcripción', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  const text = cleanTranscription(raw)
  return NextResponse.json({ text })
}
