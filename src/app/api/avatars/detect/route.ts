// SIR V2 — POST /api/avatars/detect. Recibe una imagen (multipart 'file') y le
// pide a la visión la caja (bounding box) de la foto de perfil / cara principal.
// Devuelve {found, x, y, w, h} normalizado 0..1 (esquina sup-izq + tamaño).
// El usuario CONFIRMA el recorte después (esto solo pre-encuadra).
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

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
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ found: false })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'form inválido' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'file requerido' }, { status: 400 })
  if (file.size > MAX_BYTES || file.size === 0) return NextResponse.json({ found: false })

  try {
    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const client = new Anthropic({ maxRetries: 1 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 150,
      system: 'Sos un detector de fotos de perfil. Devolvés SOLO JSON, sin texto extra.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType(file.type || 'image/jpeg'), data: b64 } },
          { type: 'text', text: 'En esta imagen, ubicá la FOTO DE PERFIL o la cara de la persona principal (la más prominente). Devolvé SOLO este JSON con la caja normalizada 0..1 (origen arriba-izquierda): {"found": true|false, "x": <izq>, "y": <arriba>, "w": <ancho>, "h": <alto>}. Si no hay cara/foto de persona, found:false. Hacé la caja un poco amplia para incluir toda la cabeza.' },
        ],
      }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    const raw = block && block.type === 'text' ? block.text : ''
    const s = raw.indexOf('{'); const e = raw.lastIndexOf('}')
    if (s < 0 || e <= s) return NextResponse.json({ found: false })
    const p = JSON.parse(raw.slice(s, e + 1)) as { found?: boolean; x?: number; y?: number; w?: number; h?: number }
    if (!p.found || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.w !== 'number' || typeof p.h !== 'number') {
      return NextResponse.json({ found: false })
    }
    const cl = (n: number) => Math.max(0, Math.min(1, n))
    return NextResponse.json({ found: true, x: cl(p.x), y: cl(p.y), w: cl(p.w), h: cl(p.h) })
  } catch (e) {
    reportApiError(e, { route: 'avatars/detect' })
    return NextResponse.json({ found: false })
  }
}
