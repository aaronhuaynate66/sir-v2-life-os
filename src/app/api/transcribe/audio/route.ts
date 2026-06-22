// SIR V2 — POST /api/transcribe/audio (multipart). Transcribe un audio chico
// (nota de voz de WhatsApp) directo, sin pasar por Storage. Reusa Whisper
// (lib/transcribe/openai). Auth requerida. Tope de tamaño por nota de voz.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transcribeAudio, TranscribeError } from '@/lib/transcribe/openai'
import { reportApiError } from '@/lib/observability/reportApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BYTES = 20 * 1024 * 1024

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'form inválido' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'file requerido' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Audio demasiado grande' }, { status: 413 })
  if (file.size === 0) return NextResponse.json({ error: 'Audio vacío' }, { status: 400 })

  try {
    const buf = await file.arrayBuffer()
    const name = file instanceof File ? file.name : 'audio.ogg'
    const text = await transcribeAudio(buf, name, file.type || 'audio/ogg')
    return NextResponse.json({ text })
  } catch (e) {
    if (e instanceof TranscribeError) return NextResponse.json({ error: 'No se pudo transcribir', detail: e.message }, { status: 502 })
    reportApiError(e, { route: 'transcribe/audio' })
    return NextResponse.json({ error: 'Error transcribiendo', detail: String(e).slice(0, 160) }, { status: 500 })
  }
}
