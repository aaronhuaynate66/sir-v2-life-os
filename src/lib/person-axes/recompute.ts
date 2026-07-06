// SIR V2 — Recomputar un eje tras DESCARTAR una captura de perfil.
//
// Bug real (caso Diana, 07-06): descartar una captura instagram/linkedin marcaba
// la observación is_obsolete=true, pero el eje social/profesional (person_profile_axes)
// es un SNAPSHOT que quedaba pegado con la data mala → "no puedo eliminar el mal
// registro". Esto lo cierra: al descartar, se regenera el eje desde la ÚLTIMA
// captura buena (no-obsoleta) que quede, o se limpia si no queda ninguna. Respeta
// source='manual' (nunca pisa lo editado a mano).

import type { SupabaseClient } from '@supabase/supabase-js'

import { computeSocialAxis, computeProfessionalAxis } from './compute'
import { upsertAxisAuto, type AxisKind } from './upsert'
import { getProfileAxes } from './fetch'

const CAPTURE_FOR: Record<AxisKind, string> = { social: 'instagram', professional: 'linkedin' }

/** Eje que corresponde a un capture_type de perfil, o null si no es de perfil. */
export function axisForCapture(captureType: string): AxisKind | null {
  if (captureType === 'instagram') return 'social'
  if (captureType === 'linkedin') return 'professional'
  return null
}

export async function recomputeAxisFor(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  axis: AxisKind,
): Promise<void> {
  const captureType = CAPTURE_FOR[axis]
  const { data: latest } = await supabase
    .from('observations')
    .select('id, data')
    .eq('user_id', userId).eq('person_id', personId)
    .eq('capture_type', captureType).eq('is_obsolete', false)
    .order('observed_at', { ascending: false })
    .limit(1).maybeSingle()

  let text: string | null = null
  if (latest?.data) {
    const d = latest.data as Record<string, unknown>
    if (axis === 'social') {
      text = computeSocialAxis(d)
    } else {
      const { data: person } = await supabase.from('people').select('education').eq('id', personId).maybeSingle()
      text = computeProfessionalAxis(d, (person?.education as string) ?? null)
    }
  }

  if (text && latest) {
    await upsertAxisAuto(supabase, userId, personId, axis, text, latest.id as string)
    return
  }

  // No queda captura buena → limpiar el eje (solo si es auto, no manual).
  const existing = await getProfileAxes(supabase, userId, personId)
  if (axis === 'social' && existing?.socialSource === 'manual') return
  if (axis === 'professional' && existing?.professionalSource === 'manual') return
  const clear = axis === 'social'
    ? { social_text: null, social_observation_ids: [], social_generated_at: null }
    : { professional_text: null, professional_observation_ids: [], professional_generated_at: null }
  await supabase.from('person_profile_axes')
    .update({ ...clear, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('person_id', personId)
}
