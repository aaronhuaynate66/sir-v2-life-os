// SIR V2 — POST /api/capture/whatsapp-export/sticker-tone (multipart 'file').
// Devuelve el TONO emocional de un sticker (.webp) en 1-3 palabras. NO guarda el
// sticker: solo su carga emocional, para alimentar el tono de la conversación.
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
const MODEL_ID = 'claude-haiku-4-5-20251001'
const MAX_BYTES = 3 * 1024 * 1024

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ tone: '' })
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'form inválido' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'file requerido' }, { status: 400 })
  if (file.size > MAX_BYTES || file.size === 0) return NextResponse.json({ tone: '' })
  try {
    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const client = new Anthropic({ maxRetries: 1 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 30,
      system: 'Devolvés SOLO JSON.',
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: b64 } },
        { type: 'text', text: 'Este es un sticker de WhatsApp. ¿Qué carga emocional transmite? Respondé SOLO {"tone":"<1-3 palabras en español: ej. cariño, humor, fastidio, ternura, enojo, festejo, bajar tensión, neutral>"}.' },
      ] }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    const raw = block && block.type === 'text' ? block.text : ''
    const s = raw.indexOf('{'); const e = raw.lastIndexOf('}')
    if (s < 0 || e <= s) return NextResponse.json({ tone: '' })
    const p = JSON.parse(raw.slice(s, e + 1)) as { tone?: string }
    return NextResponse.json({ tone: typeof p.tone === 'string' ? p.tone.slice(0, 40).trim() : '' })
  } catch (e) {
    reportApiError(e, { route: 'whatsapp-export/sticker-tone' })
    return NextResponse.json({ tone: '' })
  }
}
