// SIR V2 — Server-side helpers para leer observations en la vista detalle.
//
// PRINCIPIO CRITICO (no negociable):
//   is_obsolete = false es el LIMITE DE LA VISTA CURADA. TODA query de
//   observations que alimente la UI DEBE filtrar is_obsolete = false.
//   Recien soft-deleteamos filas alucinadas (BUG-002 cleanup); si no se
//   filtran, se renderizan. Sesion 3 entera respeta esto.
//
// Orden: observed_at DESC (NO captured_at — observed_at es el "cuando
// paso", captured_at es el "cuando se ingreso"). Para una linea de tiempo
// real de la persona usamos observed_at.
//
// Estos helpers asumen un SupabaseClient ya autenticado (server client del
// route handler / page). RLS hace el filtro user_id; ademas pasamos
// .eq('user_id', userId) explicito para que un bug RLS no abra otra
// persona ajena.

import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  CaptureType,
  Confidence,
  DetectorResult,
  Observation,
} from '@/lib/capture/observations/types'

const OBSERVATION_COLUMNS =
  'id, user_id, person_id, capture_type, source_image_path, storage_bucket, data, detector_data, user_edits, confidence, needs_review, observed_at, captured_at, is_obsolete, obsoleted_at, obsoleted_reason, created_at'

/** Conversion snake_case (DB) -> camelCase (TS). Idem al adapter de
 *  /api/observations/[id] — mantenemos una sola forma de leer rows. */
export function rowToObservation(row: Record<string, unknown>): Observation {
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

export interface GetObservationsOptions {
  /** Default 100. La vista detalle no necesita mas que eso. */
  limit?: number
  /** Si se pasa, restringe a uno o varios capture_type (ej. solo
   *  whatsapp_chat, o [whatsapp_chat, whatsapp_web] para conversaciones). */
  captureType?: CaptureType | readonly CaptureType[]
}

/**
 * Fetch de observations de UNA persona, curadas (is_obsolete = false),
 * ordenadas por observed_at DESC.
 *
 * Reusable: la usa LastInteractionPanel (con captureType filter),
 * el bloque "Vida social" en PR-B, futuras visualizaciones, etc.
 */
export async function getObservationsForPerson(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  opts: GetObservationsOptions = {},
): Promise<Observation[]> {
  let query = supabase
    .from('observations')
    .select(OBSERVATION_COLUMNS)
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('is_obsolete', false) // ← guardrail
    .order('observed_at', { ascending: false })
    .limit(opts.limit ?? 100)

  if (opts.captureType) {
    query = Array.isArray(opts.captureType)
      ? query.in('capture_type', [...opts.captureType])
      : query.eq('capture_type', opts.captureType as CaptureType)
  }

  const { data, error } = await query
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map(rowToObservation)
}

/**
 * Convenience: la observation mas reciente para una persona, filtrada
 * por capture_type. Devuelve null si no hay.
 *
 * Usada por LastInteractionPanel con captureType='whatsapp_chat' para
 * mostrar "Ultima interaccion: hace N dias".
 */
export async function getLatestObservation(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  captureType: CaptureType | readonly CaptureType[],
): Promise<Observation | null> {
  let query = supabase
    .from('observations')
    .select(OBSERVATION_COLUMNS)
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('is_obsolete', false) // ← guardrail
  query = Array.isArray(captureType)
    ? query.in('capture_type', [...captureType])
    : query.eq('capture_type', captureType as CaptureType)
  const { data, error } = await query
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return rowToObservation(data as unknown as Record<string, unknown>)
}
