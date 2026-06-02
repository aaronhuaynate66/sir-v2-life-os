// SIR V2 — Upsert server-side de un eje (profesional|social) en
// person_profile_axes (0047).
//
// Se llama en el momento de la captura (best-effort) para PERSISTIR el eje
// recién computado. Reglas:
//   - Un row por (user_id, person_id). Merge read→upsert preservando el OTRO
//     eje (un upsert pelado pisaría toda la fila).
//   - Respeta source='manual': si el usuario editó el eje a mano (futuro editor
//     inline), NO lo pisamos con la recomputación automática.
//   - Tolerante a que la tabla no exista (migración 0047 sin correr): cualquier
//     error se propaga al caller, que envuelve en try/catch y nunca rompe la
//     captura.

import type { SupabaseClient } from '@supabase/supabase-js'

import { getProfileAxes } from './fetch'
import type { PersonProfileAxes } from './types'

export type AxisKind = 'professional' | 'social'

/**
 * Persiste (auto) el texto de UN eje para una persona. Devuelve true si
 * escribió, false si lo saltó (eje en 'manual') o si no había texto.
 *
 * `observationId` es la captura fuente (trazabilidad). `text` null/empty no
 * borra lo previo: simplemente no escribe (evita pisar un eje bueno con vacío).
 */
export async function upsertAxisAuto(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  axis: AxisKind,
  text: string | null,
  observationId: string | null,
): Promise<boolean> {
  const clean = text?.trim()
  if (!clean) return false

  const existing = await getProfileAxes(supabase, userId, personId)

  // Respetar edición manual: no pisar.
  if (axis === 'professional' && existing?.professionalSource === 'manual') return false
  if (axis === 'social' && existing?.socialSource === 'manual') return false

  const now = new Date().toISOString()
  const obsIds = observationId ? [observationId] : []

  // Merge: preservamos el otro eje tal cual estaba (o sus defaults).
  const row: Record<string, unknown> = {
    user_id: userId,
    person_id: personId,
    updated_at: now,
    ...professionalCols(axis, existing, clean, obsIds, now),
    ...socialCols(axis, existing, clean, obsIds, now),
  }

  const { error } = await supabase
    .from('person_profile_axes')
    .upsert(row, { onConflict: 'user_id,person_id' })
  if (error) throw new Error(error.message)
  return true
}

function professionalCols(
  axis: AxisKind,
  existing: PersonProfileAxes | null,
  text: string,
  obsIds: string[],
  now: string,
): Record<string, unknown> {
  if (axis === 'professional') {
    return {
      professional_text: text,
      professional_source: 'auto',
      professional_observation_ids: obsIds,
      professional_generated_at: now,
    }
  }
  // Preservar el eje profesional existente (o defaults limpios).
  return {
    professional_text: existing?.professionalText ?? null,
    professional_source: existing?.professionalSource ?? 'auto',
    professional_observation_ids: existing?.professionalObservationIds ?? [],
    professional_generated_at: existing?.professionalGeneratedAt ?? null,
  }
}

function socialCols(
  axis: AxisKind,
  existing: PersonProfileAxes | null,
  text: string,
  obsIds: string[],
  now: string,
): Record<string, unknown> {
  if (axis === 'social') {
    return {
      social_text: text,
      social_source: 'auto',
      social_observation_ids: obsIds,
      social_generated_at: now,
    }
  }
  return {
    social_text: existing?.socialText ?? null,
    social_source: existing?.socialSource ?? 'auto',
    social_observation_ids: existing?.socialObservationIds ?? [],
    social_generated_at: existing?.socialGeneratedAt ?? null,
  }
}
