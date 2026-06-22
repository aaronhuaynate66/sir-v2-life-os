// SIR V2 — POST /api/capture/call/transcribe
// Recibe { bucket, path } de un audio YA subido a Storage (client-side, mismo
// patrón que notas de voz). Lo baja SERVER-SIDE (sin el límite de 4.5MB del
// body de Vercel), lo transcribe con Whisper y devuelve { text }. Borra el
// audio tras transcribir (best-effort): SIR guarda el TEXTO, no el audio
// (decisión de privacidad — nunca acumular audios crudos).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transcribeAudio, TranscribeError } from '@/lib/transcribe/openai'
import { reportApiError } from '@/lib/observability/reportApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_BUCKETS = new Set(['person-voice-notes'])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  let body: { bucket?: unknown; path?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const bucket = typeof body.bucket === 'string' ? body.bucket : 'person-voice-notes'
  const path = typeof body.path === 'string' ? body.path : ''
  if (!ALLOWED_BUCKETS.has(bucket)) return NextResponse.json({ error: 'bucket no permitido' }, { status: 400 })
  if (!path) return NextResponse.json({ error: 'path requerido' }, { status: 400 })
  // El path DEBE estar bajo la carpeta del propio usuario (igual que la policy).
  if (!path.startsWith(`${userId}/`)) return NextResponse.json({ error: 'path fuera de tu carpeta' }, { status: 403 })

  try {
    const { data: blob, error } = await supabase.storage.from(bucket).download(path)
    if (error || !blob) return NextResponse.json({ error: 'No se pudo leer el audio', detail: error?.message }, { status: 404 })
    const buf = await blob.arrayBuffer()
    const mime = blob.type || 'audio/mp4'
    const filename = path.split('/').pop() || 'audio'
    const text = await transcribeAudio(buf, filename, mime)
    // Limpieza: ya tenemos el texto, no guardamos el audio.
    await supabase.storage.from(bucket).remove([path]).catch(() => {})
    return NextResponse.json({ text })
  } catch (e) {
    if (e instanceof TranscribeError) {
      return NextResponse.json({ error: 'No se pudo transcribir', detail: e.message }, { status: 502 })
    }
    reportApiError(e, { route: 'capture/call/transcribe' })
    return NextResponse.json({ error: 'Error transcribiendo', detail: String(e).slice(0, 160) }, { status: 500 })
  }
}
