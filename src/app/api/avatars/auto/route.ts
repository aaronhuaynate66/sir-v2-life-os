// SIR V2 — POST /api/avatars/auto { person_id }
//
// Auto-avatar: en vez de pedirle al usuario que suba una foto, SIR usa las
// capturas que YA tiene de la persona (Instagram/LinkedIn), detecta la foto de
// perfil / cara con visión y la recorta él mismo. Responde a la fricción de
// Aaron (jul-2026): "¿por qué tengo que subir yo una foto si te pasé muchas?".
//
// Flujo: candidatas (instagram → linkedin, recientes) → por cada una: descarga
// del bucket → visión ubica la caja de la foto de perfil → recorta (sharp,
// cuadrado 1.5× centrado) → sube a person-avatars → setea el avatar. Para en la
// primera que funciona. 422 si ninguna captura tiene una cara detectable.

import sharp from 'sharp'
import { NextResponse, type NextRequest } from 'next/server'

import { complete } from '@/lib/llm'
import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { avatarCropRect, type DetectBox } from '@/lib/avatars/cropRect'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AVATAR_BUCKET = 'person-avatars'
const OUT = 400
const MAX_CANDIDATES = 5

const DETECT_PROMPT =
  'Esta es una captura de un perfil (Instagram/LinkedIn) o una foto. Ubica EXCLUSIVAMENTE la FOTO DE PERFIL o la CARA principal de la persona dueña del perfil: el avatar circular/cuadrado junto al nombre/@handle, o el rostro más prominente. NO elijas caras del feed, de historias, de fotos sugeridas ni de otras personas. Devuelve SOLO este JSON con la caja normalizada 0..1 (origen arriba-izquierda), un poco amplia para incluir toda la cabeza: {"found": true|false, "x": <izq>, "y": <arriba>, "w": <ancho>, "h": <alto>}. Si no ves una cara/foto de perfil clara, found:false.'

// El mediaType DEBE salir de los bytes reales (sharp), no de la extensión: en el
// storage hay archivos .webp que en verdad son PNG — un mediaType que no coincide
// hace que la visión rechace la imagen.
function mediaTypeFromFormat(format: string | undefined): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  switch (format) {
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    default: return 'image/jpeg'
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado', detail: 'Inicia sesión y reinténtalo.' }, { status: 401 })
  const userId = auth.user.id

  let body: { person_id?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const personId = typeof body.person_id === 'string' ? body.person_id : ''
  if (!personId) return NextResponse.json({ error: 'person_id requerido' }, { status: 400 })

  const { data: prow } = await supabase.from('people').select('id').eq('user_id', userId).eq('id', personId).maybeSingle()
  if (!prow) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 })

  // Capturas con imagen de esta persona. Instagram/LinkedIn primero (tienen foto
  // de perfil clara); las más recientes primero.
  const { data: obsRows } = await supabase
    .from('observations')
    .select('capture_type, source_image_path, storage_bucket, observed_at')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .not('source_image_path', 'is', null)
    .not('storage_bucket', 'is', null)
    .order('observed_at', { ascending: false })
    .limit(30)

  const candidates = (obsRows ?? [] as Array<Record<string, unknown>>)
    .map((r) => ({
      captureType: String((r as Record<string, unknown>).capture_type ?? ''),
      path: String((r as Record<string, unknown>).source_image_path ?? ''),
      bucket: String((r as Record<string, unknown>).storage_bucket ?? ''),
    }))
    .filter((c) => c.path && c.bucket)
    .sort((a, b) => rank(a.captureType) - rank(b.captureType))
    .slice(0, MAX_CANDIDATES)

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: 'Sin capturas con foto', detail: 'No hay capturas de Instagram/LinkedIn de esta persona para sacar una foto. Sube una desde el botón de cámara.' },
      { status: 422 },
    )
  }

  for (const cand of candidates) {
    try {
      const { data: blob, error: dlErr } = await supabase.storage.from(cand.bucket).download(cand.path)
      if (dlErr || !blob) continue
      const buf = Buffer.from(await blob.arrayBuffer())
      const meta = await sharp(buf).metadata()
      const W = meta.width ?? 0
      const H = meta.height ?? 0
      if (!W || !H) continue

      const box = await detectBox(buf, mediaTypeFromFormat(meta.format), supabase, userId)
      if (!box) continue

      const { left, top, side } = avatarCropRect(box, W, H)
      const cropped = await sharp(buf)
        .extract({ left, top, width: side, height: side })
        .resize(OUT, OUT, { fit: 'cover' })
        .jpeg({ quality: 88 })
        .toBuffer()

      const avatarPath = `${userId}/${personId}.jpg`
      const up = await supabase.storage.from(AVATAR_BUCKET).upload(avatarPath, cropped, { contentType: 'image/jpeg', upsert: true })
      if (up.error) continue

      await supabase.from('person_avatars').upsert(
        { user_id: userId, person_id: personId, storage_path: avatarPath, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,person_id' },
      )
      const { data: signed } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(avatarPath, 3600)
      return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null, source: cand.captureType })
    } catch (e) {
      reportApiError(e, { route: 'avatars/auto', bucket: cand.bucket })
      // seguimos con la siguiente candidata
    }
  }

  return NextResponse.json(
    { error: 'No detecté una cara', detail: 'Probé tus capturas pero no pude ubicar una foto de perfil clara. Sube una foto desde el botón de cámara.' },
    { status: 422 },
  )
}

/** Prioridad de captura: instagram (foto de perfil nítida) > linkedin > resto. */
function rank(captureType: string): number {
  if (captureType === 'instagram') return 0
  if (captureType === 'linkedin') return 1
  return 2
}

/** Visión: ubica la caja de la foto de perfil/cara. null si no hay o falla. */
async function detectBox(
  buf: Buffer,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<DetectBox | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const res = await complete(
      {
        task: 'avatars_detect', tier: 'cheap', sensitivity: 'third_party', maxTokens: 150,
        system: 'Eres un detector de fotos de perfil. Devuelve SOLO JSON, sin texto extra.',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', mediaType, data: buf.toString('base64') } },
            { type: 'text', text: DETECT_PROMPT },
          ],
        }],
      },
      { supabase, userId },
    )
    const raw = res.text
    const s = raw.indexOf('{'); const e = raw.lastIndexOf('}')
    if (s < 0 || e <= s) return null
    const p = JSON.parse(raw.slice(s, e + 1)) as { found?: boolean; x?: number; y?: number; w?: number; h?: number }
    if (!p.found || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.w !== 'number' || typeof p.h !== 'number') return null
    const cl = (n: number) => Math.max(0, Math.min(1, n))
    return { x: cl(p.x), y: cl(p.y), w: cl(p.w), h: cl(p.h) }
  } catch {
    return null
  }
}
