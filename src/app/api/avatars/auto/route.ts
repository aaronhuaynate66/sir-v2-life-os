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
import { avatarCropRect } from '@/lib/avatars/cropRect'
import { parseFaceAssessment, scoreFaceCandidate, MIN_FACE_SCORE, type FaceAssessment } from '@/lib/avatars/faceScore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AVATAR_BUCKET = 'person-avatars'
const OUT = 400
const MAX_CANDIDATES = 5

// Pide una CARA (no un recuadro de "foto de perfil"), y que la evalúe: de frente,
// nítida y de UNA sola persona. Así el auto-avatar prioriza caras reconocibles y
// descarta paisajes/cuerpos enteros donde la cara sale diminuta.
const DETECT_PROMPT =
  'Esta imagen es una captura de un perfil (Instagram/LinkedIn) o una foto. Ubica la CARA de la persona dueña del perfil (la foto de perfil junto al nombre/@handle, o el rostro principal). Ignora caras del feed, de historias, de fotos sugeridas o de otras personas. ' +
  'Devuelve SOLO este JSON, sin texto extra: {"found": true|false, "x": <izq>, "y": <arriba>, "w": <ancho>, "h": <alto>, "frontal": true|false, "clarity": "clear"|"partial"|"none", "faceCount": <entero>}. ' +
  'La caja (x,y,w,h) está normalizada 0..1 (origen arriba-izquierda) y encierra la CABEZA. ' +
  '"frontal": true si la cara mira aprox. a la cámara (no de perfil ni de espaldas). ' +
  '"clarity": "clear" si la cara es grande y nítida (reconocible); "partial" si es chica, lejana, borrosa o tapada; "none" si no hay cara humana clara (paisaje, cuerpo entero lejano, logo, texto). ' +
  '"faceCount": cuántas caras humanas se ven en total. ' +
  'Si no hay una cara humana clara, found:false y clarity:"none".'

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

  // Evaluamos TODAS las candidatas y nos quedamos con la MEJOR cara de frente
  // (antes: la primera que diera cualquier caja → salían paisajes/cuerpos
  // enteros). Si ninguna llega al mínimo, NO recortamos: mejor sin avatar que
  // una referencia sin cara (rompe el match por cara).
  let best: { buf: Buffer; W: number; H: number; box: NonNullable<FaceAssessment['box']>; score: number; source: string } | null = null
  for (const cand of candidates) {
    try {
      const { data: blob, error: dlErr } = await supabase.storage.from(cand.bucket).download(cand.path)
      if (dlErr || !blob) continue
      const buf = Buffer.from(await blob.arrayBuffer())
      const meta = await sharp(buf).metadata()
      const W = meta.width ?? 0
      const H = meta.height ?? 0
      if (!W || !H) continue

      const assess = await detectFace(buf, mediaTypeFromFormat(meta.format), supabase, userId)
      const score = scoreFaceCandidate(assess)
      if (score >= MIN_FACE_SCORE && assess.box && (!best || score > best.score)) {
        best = { buf, W, H, box: assess.box, score, source: cand.captureType }
      }
    } catch (e) {
      reportApiError(e, { route: 'avatars/auto', bucket: cand.bucket })
      // seguimos con la siguiente candidata
    }
  }

  if (!best) {
    return NextResponse.json(
      { error: 'No encontré una cara clara', detail: 'Tus capturas de esta persona no tienen una foto de frente reconocible (salen de lejos, de perfil o sin cara). Sube una foto desde el botón de cámara.' },
      { status: 422 },
    )
  }

  try {
    const { left, top, side } = avatarCropRect(best.box, best.W, best.H)
    const cropped = await sharp(best.buf)
      .extract({ left, top, width: side, height: side })
      .resize(OUT, OUT, { fit: 'cover' })
      .jpeg({ quality: 88 })
      .toBuffer()

    const avatarPath = `${userId}/${personId}.jpg`
    const up = await supabase.storage.from(AVATAR_BUCKET).upload(avatarPath, cropped, { contentType: 'image/jpeg', upsert: true })
    if (up.error) {
      return NextResponse.json({ error: 'No se pudo subir el avatar', detail: up.error.message.slice(0, 160) }, { status: 500 })
    }

    // El .upsert() de PostgREST NO lanza: devuelve el error en `.error`. Si no
    // lo chequeamos, un fallo de guardado (ej. el bug histórico de tipo de
    // person_id) pasaba desapercibido y respondíamos ok:true con la cara subida
    // al storage pero SIN la fila que la mapea → el avatar nunca se mostraba.
    const ins = await supabase.from('person_avatars').upsert(
      { user_id: userId, person_id: personId, storage_path: avatarPath, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,person_id' },
    )
    if (ins.error) {
      reportApiError(ins.error, { route: 'avatars/auto', step: 'persist', personId })
      return NextResponse.json({ error: 'No se pudo guardar el avatar', detail: ins.error.message.slice(0, 160) }, { status: 500 })
    }
    const { data: signed } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(avatarPath, 3600)
    return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null, source: best.source }, { status: 200 })
  } catch (e) {
    reportApiError(e, { route: 'avatars/auto', step: 'crop' })
    return NextResponse.json({ error: 'No se pudo generar el avatar' }, { status: 500 })
  }
}

/** Prioridad de captura: instagram (foto de perfil nítida) > linkedin > resto. */
function rank(captureType: string): number {
  if (captureType === 'instagram') return 0
  if (captureType === 'linkedin') return 1
  return 2
}

/** Visión: ubica la cara y evalúa su calidad (de frente, nítida, una persona).
 *  Tier CAPAZ: juzgar frontalidad/nitidez es lo que decide la calidad del avatar
 *  y el barato no distingue bien. Evaluación "sin cara" si no hay o falla. */
async function detectFace(
  buf: Buffer,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<FaceAssessment> {
  const none: FaceAssessment = { found: false, box: null, frontal: false, clarity: 'none', faceCount: 0 }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) return none
  try {
    const res = await complete(
      {
        task: 'avatars_detect', tier: 'capable', sensitivity: 'third_party', maxTokens: 150,
        system: 'Eres un detector de caras para avatares. Devuelve SOLO JSON, sin texto extra.',
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
    return parseFaceAssessment(res.text)
  } catch {
    return none
  }
}
