// SIR V2 — Server-side helper para leer person_profile_axes en el detail page.
//
// Mismo patrón que person-synthesis/fetch.ts: RLS + filtro user_id explícito
// (defense-in-depth), conversión snake_case <-> camelCase. Devuelve null si la
// persona no tiene row de ejes (nunca se capturó/computó, o la migración 0047
// no corrió aún) → el componente cae al cómputo en vivo (backward-compat).

import type { SupabaseClient } from '@supabase/supabase-js'

import type { AxisSource, PersonProfileAxes } from './types'

const AXES_COLUMNS =
  'person_id, professional_text, professional_source, professional_observation_ids, professional_generated_at, social_text, social_source, social_observation_ids, social_generated_at'

function asSource(v: unknown): AxisSource {
  return v === 'manual' ? 'manual' : 'auto'
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function rowToProfileAxes(row: Record<string, unknown>): PersonProfileAxes {
  return {
    personId: row.person_id as string,
    professionalText: (row.professional_text as string | null) ?? null,
    professionalSource: asSource(row.professional_source),
    professionalObservationIds: asStringArray(row.professional_observation_ids),
    professionalGeneratedAt: (row.professional_generated_at as string | null) ?? null,
    socialText: (row.social_text as string | null) ?? null,
    socialSource: asSource(row.social_source),
    socialObservationIds: asStringArray(row.social_observation_ids),
    socialGeneratedAt: (row.social_generated_at as string | null) ?? null,
  }
}

/**
 * Los ejes persistidos (profesional + social) de una persona. null si no hay
 * row todavía. Tolerante a que la tabla no exista (migración 0047 sin correr):
 * en ese caso Supabase devuelve error y devolvemos null sin romper la página.
 */
export async function getProfileAxes(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
): Promise<PersonProfileAxes | null> {
  const { data, error } = await supabase
    .from('person_profile_axes')
    .select(AXES_COLUMNS)
    .eq('user_id', userId)
    .eq('person_id', personId)
    .maybeSingle()
  if (error || !data) return null
  return rowToProfileAxes(data as Record<string, unknown>)
}
