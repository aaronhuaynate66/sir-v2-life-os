// SIR V2 — /api/voice-notes (#12 "Nota de voz" del detail page)
//
// POST: registra una nota de voz ya subida a Storage como una observation
//   (capture_type='voice_note'). El audio se sube CLIENT-SIDE al bucket
//   person-voice-notes (RLS por carpeta {userId}); acá solo insertamos la
//   fila con ownership verificado. Mismo patrón que /api/person-logs.
//   Body: { person_id, storage_path, duration_sec, mime }
//   201: { observation }
//
// DELETE: borrado suave de una nota de voz (is_obsolete=true) + remove
//   best-effort del blob en Storage. NO es un hard delete — sigue el
//   modelo is_obsolete de observations.
//   Body: { observation_id }
//   200: { ok: true }

import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { insertObservation } from '@/lib/capture/observations/insert'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const VOICE_BUCKET = 'person-voice-notes'

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let body: { person_id?: unknown; storage_path?: unknown; duration_sec?: unknown; mime?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }

  if (typeof body.person_id !== 'string' || !body.person_id) {
    return errorJson(400, 'person_id requerido (string no vacio)')
  }
  if (typeof body.storage_path !== 'string' || !body.storage_path) {
    return errorJson(400, 'storage_path requerido (string no vacio)')
  }
  // Guardrail: el path DEBE estar bajo la carpeta del propio user (igual
  // que la policy de Storage). Evita registrar un audio ajeno.
  if (!body.storage_path.startsWith(`${userId}/`)) {
    return errorJson(403, 'storage_path fuera de tu carpeta')
  }
  const personId = body.person_id
  const storagePath = body.storage_path
  const durationSec =
    typeof body.duration_sec === 'number' && Number.isFinite(body.duration_sec)
      ? Math.max(0, Math.round(body.duration_sec))
      : null
  const mime = typeof body.mime === 'string' ? body.mime.slice(0, 60) : null

  // Ownership de la persona (404 si ajena).
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) return errorJson(500, 'No se pudo verificar la persona', personErr.message)
  if (!personRow) return errorJson(404, 'Persona no encontrada o sin permiso')

  try {
    const observation = await insertObservation(supabase, {
      userId,
      personId,
      captureType: 'voice_note',
      sourceImagePath: storagePath,
      storageBucket: VOICE_BUCKET,
      data: { durationSec, mime },
      detectorData: null,
      confidence: null,
      observedAt: new Date().toISOString(),
      needsReview: false,
    })
    return NextResponse.json({ observation }, { status: 201 })
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : String(e)
    // El audio ya está en Storage; lo limpiamos para no dejar huérfano.
    await supabase.storage.from(VOICE_BUCKET).remove([storagePath]).catch(() => {})
    return errorJson(500, 'No se pudo registrar la nota de voz', msg.slice(0, 200))
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let body: { observation_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }
  if (typeof body.observation_id !== 'string' || !body.observation_id) {
    return errorJson(400, 'observation_id requerido')
  }

  // Traer la fila (RLS-scoped) para validar tipo + obtener el path.
  const { data: row, error: selErr } = await supabase
    .from('observations')
    .select('id, capture_type, storage_bucket, source_image_path')
    .eq('id', body.observation_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (selErr) return errorJson(500, 'No se pudo leer la nota', selErr.message)
  if (!row) return errorJson(404, 'Nota no encontrada o sin permiso')
  if (row.capture_type !== 'voice_note') {
    return errorJson(400, 'La observación no es una nota de voz')
  }

  // Soft-delete: is_obsolete=true (no hard delete — modelo observations).
  const { error: updErr } = await supabase
    .from('observations')
    .update({
      is_obsolete: true,
      obsoleted_at: new Date().toISOString(),
      obsoleted_reason: 'user_deleted_voice_note',
    })
    .eq('id', body.observation_id)
    .eq('user_id', userId)
  if (updErr) return errorJson(500, 'No se pudo borrar la nota', updErr.message)

  // Remove best-effort del blob (es contenido propio del user).
  const bucket = (row.storage_bucket as string | null) ?? VOICE_BUCKET
  const path = row.source_image_path as string | null
  if (path) {
    await supabase.storage.from(bucket).remove([path]).catch(() => {})
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
