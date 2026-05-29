// SIR V2 — Helper server-side para insertar rows en observations.
//
// Usado desde el route handler /api/capture/process. Toma los pedazos
// listos (data, detector_data, source_image_path, etc) y hace un INSERT
// respetando RLS (auth.uid()).
//
// El cliente Supabase se pasa por parametro para reutilizar la sesion
// del request (cookies). NO crea un cliente service-role.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { CaptureType, Confidence, DetectorResult, Observation } from './types'

export interface InsertObservationInput {
  userId: string
  personId: string | null
  captureType: CaptureType
  sourceImagePath: string | null
  storageBucket: string | null
  /** Output sanitizado del extractor especifico, o {} si no aplica. */
  data: Record<string, unknown>
  /** DetectorResult crudo cuando vino del detector universal, null si no. */
  detectorData: DetectorResult | null
  confidence: Confidence | null
  /** ISO 8601 de cuando ES la info (header date, etc). */
  observedAt: string
  needsReview?: boolean
}

/**
 * Map snake_case <-> camelCase para el row de observations. Centralizado
 * acá para evitar drift entre el route y el tipo TS.
 */
function toRowFromInput(input: InsertObservationInput): Record<string, unknown> {
  return {
    user_id: input.userId,
    person_id: input.personId,
    capture_type: input.captureType,
    source_image_path: input.sourceImagePath,
    storage_bucket: input.storageBucket,
    data: input.data,
    detector_data: input.detectorData,
    confidence: input.confidence,
    observed_at: input.observedAt,
    needs_review: input.needsReview ?? false,
  }
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

/**
 * Inserta una observation y devuelve el row recien creado (camelCase).
 *
 * Throws Error si Supabase rechaza el insert. El caller debe manejar
 * la compensacion (ej. eliminar la imagen ya subida a Storage).
 */
export async function insertObservation(
  supabase: SupabaseClient,
  input: InsertObservationInput,
): Promise<Observation> {
  const row = toRowFromInput(input)
  const { data, error } = await supabase
    .from('observations')
    .insert(row)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`No se pudo insertar observation: ${error?.message ?? 'sin data'}`)
  }
  return toObservation(data as Record<string, unknown>)
}
