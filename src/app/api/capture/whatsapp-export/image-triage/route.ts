// SIR V2 — POST /api/capture/whatsapp-export/image-triage (multipart 'file').
// Clasifica una imagen de WhatsApp: foto PERSONAL (no guardar) vs DOCUMENTO/
// SCREENSHOT con data útil (extraer). Devuelve { keep, kind, text }.
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL_ID = 'claude-haiku-4-5-20251001'
const MAX_BYTES = 6 * 1024 * 1024
function mediaType(t: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (t.includes('png')) return 'image/png'
  if (t.includes('webp')) return 'image/webp'
  if (t.includes('gif')) return 'image/gif'
  return 'image/jpeg'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ keep: false })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'form inválido' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'file requerido' }, { status: 400 })
  if (file.size > MAX_BYTES || file.size === 0) return NextResponse.json({ keep: false })

  try {
    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const client = new Anthropic({ maxRetries: 1 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 400,
      system: 'Clasificás imágenes de chats. Devolvés SOLO JSON, sin texto extra.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType(file.type || 'image/jpeg'), data: b64 } },
          { type: 'text', text: 'Clasificá esta imagen de un chat de WhatsApp. ¿Es una FOTO PERSONAL/social (gente, familia, viaje, comida, meme gracioso, paisaje) o un DOCUMENTO/CAPTURA con DATA útil (factura, comprobante, dirección, ficha, screenshot de info, pantallazo de texto, captura de otra app, voucher, dni, contrato)? Devolvé SOLO este JSON: {"keep": true|false, "kind": "personal"|"documento"|"captura"|"otro", "text": "<si keep=true, la DATA/texto importante en <=300 chars; si no, vacío>"}. keep=true SOLO si tiene info que valga la pena guardar (documento/captura). Fotos personales/memes/paisajes/comida → keep=false. No describas fotos personales.' },
        ],
      }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    const raw = block && block.type === 'text' ? block.text : ''
    const s = raw.indexOf('{'); const e = raw.lastIndexOf('}')
    if (s < 0 || e <= s) return NextResponse.json({ keep: false })
    const p = JSON.parse(raw.slice(s, e + 1)) as { keep?: boolean; kind?: string; text?: string }
    const keep = p.keep === true && typeof p.text === 'string' && p.text.trim().length > 0
    return NextResponse.json({ keep, kind: typeof p.kind === 'string' ? p.kind : 'otro', text: keep ? (p.text as string).slice(0, 300).trim() : '' })
  } catch (e) {
    reportApiError(e, { route: 'whatsapp-export/image-triage' })
    return NextResponse.json({ keep: false })
  }
}
