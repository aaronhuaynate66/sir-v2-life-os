// SIR V2 — PATCH /api/observations/[id]
//
// Endpoint minimo para actualizar la vinculacion persona ↔ observacion
// post-save (Sesion 2.7 BUG-002). Cuando el matcher no auto-linkea, la
// UI muestra candidatos; al clickear uno, llama acá.
//
// Solo permite cambiar campos seguros (`person_id` por ahora). RLS
// garantiza que el user solo puede tocar sus propias observations.
//
// Body JSON:
//   { person_id: string | null }
//
// Response 200: { observation: Observation }

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import type {
  CaptureType,
  Confidence,
  DetectorResult,
  Observation,
} from '@/lib/capture/observations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PatchBody {
  person_id?: unknown
}

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

function toObservation(row: Record<string, unknown>): Observation {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    personId: (row.person_id as string | null) ?? null,
    captureType: row.capture_type as CaptureType,
    sourceImagePath: (row.source_image_path as string | null) ?? null,
    storageBucket: (row.storage_bucket as string | null) ?? null,
    data: (row.data as Record<string, unknown>) ?? {},
    detectorData: (row.detector_data as DetectorResult | null) ?? null,
    userEdits: (row.user_edits as Record<string, unknown> | null) ?? null,
    confidence: (row.confidence as Confidence | null) ?? null,
    needsReview: Boolean(row.needs_review),
    observedAt: row.observed_at as string,
    capturedAt: row.captured_at as string,
    isObsolete: Boolean(row.is_obsolete),
    obsoletedAt: (row.obsoleted_at as string | null) ?? null,
    obsoletedReason: (row.obsoleted_reason as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const { id } = await ctx.params
  if (!id || typeof id !== 'string' || id.length < 1) {
    return errorJson(400, 'id invalido')
  }

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }

  // Por ahora solo aceptamos person_id (string para vincular, null para
  // desvincular). Mas adelante: user_edits, needs_review override, etc.
  if (!('person_id' in body)) {
    return errorJson(400, 'Falta person_id en el body')
  }
  if (body.person_id !== null && typeof body.person_id !== 'string') {
    return errorJson(400, 'person_id debe ser string o null')
  }

  const update: Record<string, unknown> = {
    person_id: body.person_id,
  }

  // RLS deja pasar solo rows del user. Si pasa un id ajeno -> 0 rows
  // afectadas y trataremos como 404.
  const { data, error } = await supabase
    .from('observations')
    .update(update)
    .eq('id', id)
    .eq('user_id', authData.user.id)
    .select('*')
    .single()

  if (error || !data) {
    return errorJson(404, 'Observation no encontrada o sin permiso', error?.message)
  }

  const observation = toObservation(data as Record<string, unknown>)
  return NextResponse.json({ observation }, { status: 200 })
}
