// SIR V2 — POST /api/social/unmatched/face-match (match por cara, capa 2).
//
// Compara cada cara misteriosa de la bandeja ¿quién es quién? (avatar_path
// snapshoteado) contra la GALERÍA de contactos con avatar (person_avatars) usando
// visión barata (Qwen-VL). Guarda el veredicto en la fila (face_person_id/
// confidence/checked_at, mig 0160) para no re-correr visión.
//
// DISCIPLINA: sugerencia, nunca automático. Conservador (ver faceMatch.ts). Solo
// procesa caras aún no revisadas, acotado por invocación (costo + maxDuration).

import sharp from 'sharp'
import { NextResponse } from 'next/server'

import { complete } from '@/lib/llm'
import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { buildFaceMatchPrompt, parseFaceMatchResponse } from '@/lib/social-reader/faceMatch'
import type { LlmContentBlock } from '@/lib/llm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AVATAR_BUCKET = 'person-avatars'
const FACE_PX = 256          // achica para bajar tokens de visión
const MAX_PER_RUN = 12       // caras misteriosas por invocación (costo + tiempo)
const BATCH = 4              // concurrencia de llamadas de visión
const MAX_GALLERY = 24       // tope de candidatos por llamada

/** Baja un archivo del bucket y lo normaliza a JPEG base64 (sharp resuelve el
 *  caso .webp-que-es-PNG y acota el tamaño). null si falla. */
async function toJpegBase64(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
): Promise<string | null> {
  try {
    const { data: blob, error } = await supabase.storage.from(AVATAR_BUCKET).download(path)
    if (error || !blob) return null
    const buf = Buffer.from(await blob.arrayBuffer())
    const jpeg = await sharp(buf).resize(FACE_PX, FACE_PX, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer()
    return jpeg.toString('base64')
  } catch {
    return null
  }
}

export async function POST() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'Visión no configurada' }, { status: 503 })
  }

  try {
    // 1. Galería de referencia: contactos con avatar (+ su nombre para el mapeo).
    const { data: avRows } = await supabase
      .from('person_avatars')
      .select('person_id, storage_path')
      .eq('user_id', userId)
      .limit(MAX_GALLERY)
    const galleryRows = (avRows ?? []) as Array<{ person_id: string; storage_path: string }>
    if (galleryRows.length === 0) {
      return NextResponse.json({ checked: 0, remaining: 0, gallery: 0, suggestions: [], message: 'Aún no hay contactos con foto para comparar.' }, { status: 200 })
    }

    const ids = galleryRows.map((r) => r.person_id)
    const { data: pplRows } = await supabase.from('people').select('id, name').eq('user_id', userId).in('id', ids)
    const nameById: Record<string, string> = {}
    for (const p of (pplRows ?? []) as Array<{ id: string; name: string }>) nameById[p.id] = p.name

    // Descargar la galería una sola vez (se reusa para todas las caras).
    const gallery: Array<{ personId: string; name: string; b64: string }> = []
    for (const r of galleryRows) {
      const b64 = await toJpegBase64(supabase, r.storage_path)
      if (b64) gallery.push({ personId: r.person_id, name: nameById[r.person_id] ?? 'Contacto', b64 })
    }
    if (gallery.length === 0) {
      return NextResponse.json({ checked: 0, remaining: 0, gallery: 0, suggestions: [], message: 'No pude leer los avatares de referencia.' }, { status: 200 })
    }

    // 2. Caras misteriosas con snapshot, aún no revisadas. Recientes primero.
    const { data: umAll } = await supabase
      .from('unmatched_social_activity')
      .select('id, handle, name, avatar_path, face_checked_at')
      .not('avatar_path', 'is', null)
      .is('face_checked_at', null)
      .order('observed_at', { ascending: false })
      .limit(MAX_PER_RUN)
    const faces = (umAll ?? []) as Array<{ id: string; handle: string | null; name: string | null; avatar_path: string }>

    const { count: remainingCount } = await supabase
      .from('unmatched_social_activity')
      .select('id', { count: 'exact', head: true })
      .not('avatar_path', 'is', null)
      .is('face_checked_at', null)

    if (faces.length === 0) {
      return NextResponse.json({ checked: 0, remaining: 0, gallery: gallery.length, suggestions: [] }, { status: 200 })
    }

    // Bloques de la galería (comunes a todas las llamadas): [texto "Candidato N:", imagen].
    const galleryBlocks: LlmContentBlock[] = []
    gallery.forEach((g, i) => {
      galleryBlocks.push({ type: 'text', text: `Candidato ${i + 1}:` })
      galleryBlocks.push({ type: 'image', source: { type: 'base64', mediaType: 'image/jpeg', data: g.b64 } })
    })
    const promptText = buildFaceMatchPrompt(gallery.length)

    const suggestions: Array<{ id: string; personId: string; personName: string; confidence: string }> = []

    // 3. Una llamada de visión por cara misteriosa (en lotes para caber en tiempo).
    async function matchOne(face: { id: string; avatar_path: string }) {
      const b64 = await toJpegBase64(supabase, face.avatar_path)
      let personId: string | null = null
      let confidence: string | null = null
      if (b64) {
        try {
          const content: LlmContentBlock[] = [
            { type: 'text', text: 'FOTO OBJETIVO (la persona a identificar):' },
            { type: 'image', source: { type: 'base64', mediaType: 'image/jpeg', data: b64 } },
            { type: 'text', text: 'CANDIDATOS conocidos:' },
            ...galleryBlocks,
            { type: 'text', text: promptText },
          ]
          const res = await complete(
            { task: 'face_match', tier: 'cheap', sensitivity: 'third_party', maxTokens: 60, messages: [{ role: 'user', content }] },
            { supabase, userId },
          )
          const parsed = parseFaceMatchResponse(res.text, gallery.length)
          if (parsed.index !== null && parsed.confidence !== null) {
            const cand = gallery[parsed.index - 1]
            if (cand) { personId = cand.personId; confidence = parsed.confidence }
          }
        } catch (e) {
          reportApiError(e, { route: 'social/unmatched/face-match', step: 'vision' })
        }
      }
      // Persistir el veredicto (aunque sea sin match: face_checked_at evita re-correr).
      await supabase
        .from('unmatched_social_activity')
        .update({ face_person_id: personId, face_confidence: confidence, face_checked_at: new Date().toISOString() })
        .eq('id', face.id)
      if (personId && confidence) {
        suggestions.push({ id: face.id, personId, personName: nameById[personId] ?? 'Contacto', confidence })
      }
    }

    for (let i = 0; i < faces.length; i += BATCH) {
      await Promise.all(faces.slice(i, i + BATCH).map((f) => matchOne(f)))
    }

    const remaining = Math.max(0, (remainingCount ?? faces.length) - faces.length)
    return NextResponse.json({ checked: faces.length, remaining, gallery: gallery.length, suggestions }, { status: 200 })
  } catch (e) {
    reportApiError(e, { route: 'social/unmatched/face-match' })
    return NextResponse.json({ error: 'No se pudo correr el match por cara' }, { status: 500 })
  }
}
