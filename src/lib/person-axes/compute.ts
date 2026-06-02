// SIR V2 — Cómputo DETERMINÍSTICO de los ejes profesional/social (sin LLM).
//
// Reusa las síntesis narrativas puras (lib/person-synthesis/narrative) + la
// reconciliación de educación (lib/observations/education) + la lectura tipada
// de observations (lib/observations/profile). NO llama a ningún modelo: cero
// latencia, cero riesgo de 502. Se invoca en el momento de la captura para
// persistir el eje correspondiente en person_profile_axes (0047).
//
// PURO y testeable: entra `data` cruda de la observation + (para profesional)
// el campo people.education; sale el texto del eje (o null si no hay material).

import { readLinkedIn, readInstagram } from '@/lib/observations/profile'
import { reconcileEducation } from '@/lib/observations/education'
import { professionalNarrative, socialNarrative } from '@/lib/person-synthesis/narrative'

/** Texto del eje PROFESIONAL a partir de la `data` de una observation linkedin
 *  + la educación de registro de la persona. null si no hay material. */
export function computeProfessionalAxis(
  linkedinData: Record<string, unknown>,
  personEducation: string | null | undefined,
): string | null {
  const li = readLinkedIn(linkedinData)
  const education = reconcileEducation(personEducation ?? null, li.latestEducation ?? null)
  return professionalNarrative({ li, education })
}

/** Texto del eje SOCIAL a partir de la `data` de una observation instagram.
 *  null si no hay material (sin handle legible). */
export function computeSocialAxis(instagramData: Record<string, unknown>): string | null {
  const ig = readInstagram(instagramData)
  return socialNarrative({ ig })
}
