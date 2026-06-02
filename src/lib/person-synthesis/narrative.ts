// SIR V2 — Narrativa DETERMINÍSTICA de perfil (estilo V1, sin LLM).
//
// SIR V1 abría las secciones "Vida profesional" / "Vida social" con un PÁRRAFO
// sintetizado que se leía de corrido ("Titulada en Administración de Empresas
// con experiencia en RRHH. (…) Tiene 56 seguidores en LinkedIn (…)"), en vez de
// un volcado de campos. V2 tenía la data estructurada (extractores LinkedIn/
// Instagram) pero la mostraba como filas sueltas.
//
// Este módulo arma esos párrafos a partir de los campos YA estructurados — es
// DETERMINÍSTICO y PURO: NO llama al LLM (cero latencia, sin riesgo del 502),
// no inventa nada (sólo encadena lo observable), y respeta el tono neutro/no
// patologizante de los principios fundacionales. Reusa professionalSummary +
// fmtCount (lib/observations/profile) y ReconciledEducation (lib/observations/
// education) — no duplica el mapeo.
//
// El LLM sigue reservado para "Lo personal" (síntesis de conversaciones,
// cacheada en person_synthesis) — esa SÍ necesita modelo. Acá no.

import type { LinkedInProfileExtracted } from '@/lib/capture/linkedin/types'
import type { InstagramProfileExtracted } from '@/lib/capture/instagram/types'
import type { ReconciledEducation } from '@/lib/observations/education'
import { professionalSummary, fmtCount } from '@/lib/observations/profile'

/** Primera oración de un texto largo (about/bio), recortada para prosa. */
function firstSentence(text: string, maxLen = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const m = clean.match(/^(.*?[.!?])(\s|$)/)
  const candidate = m ? m[1] : clean
  return candidate.length > maxLen ? `${candidate.slice(0, maxLen).trim()}…` : candidate
}

/** Une oraciones (ya con su punto final) en un párrafo, sin dobles espacios. */
function joinSentences(sentences: (string | null | undefined)[]): string | null {
  const parts = sentences.map((s) => s?.trim()).filter((s): s is string => !!s)
  if (parts.length === 0) return null
  return parts.join(' ')
}

export interface ProfessionalNarrativeInput {
  li: Partial<LinkedInProfileExtracted> | null
  /** Educación reconciliada (LinkedIn > registro). */
  education: ReconciledEducation
}

/**
 * Párrafo sintetizado de "Vida profesional" a partir de los campos LinkedIn
 * estructurados + la educación reconciliada. null si no hay material.
 * Tono neutro y no-genérico (evita marcas de género: "Estudió", "Se desempeña").
 */
export function professionalNarrative(input: ProfessionalNarrativeInput): string | null {
  const { li, education } = input
  const sentences: (string | null)[] = []

  // 1. Formación (educación reconciliada — LinkedIn manda sobre registro).
  if (education.primary) {
    const hint = education.primary.hint ? ` (${education.primary.hint})` : ''
    sentences.push(`Estudió ${education.primary.value}${hint}.`)
  }

  if (li) {
    // 2. Rol actual (rol + empresa, o headline). professionalSummary ya decide.
    const summary = professionalSummary(li)
    if (summary) {
      // Si el summary es el headline (no rol+empresa), lo presentamos como tal.
      const isRole = !!(li.currentRole && li.currentCompany) || !!li.currentRole
      sentences.push(isRole ? `Se desempeña como ${summary}.` : `Se presenta como "${summary}".`)
    }

    // 3. Cómo se describe (primera oración del about).
    if (li.about) {
      sentences.push(`En su perfil se describe: "${firstSentence(li.about)}".`)
    }

    // 4. Alcance de red profesional.
    if (li.connectionsCount != null) {
      sentences.push(`Tiene ${fmtCount(li.connectionsCount)} conexiones en LinkedIn.`)
    }

    // 5. Disponibilidad declarada.
    if (li.isOpenToWork) {
      sentences.push('Figura como abierta/o a nuevas oportunidades laborales.')
    }
  }

  return joinSentences(sentences)
}

export interface SocialNarrativeInput {
  ig: Partial<InstagramProfileExtracted> | null
}

/**
 * Párrafo sintetizado de "Vida social" a partir de los campos Instagram
 * estructurados. null si no hay material.
 */
export function socialNarrative(input: SocialNarrativeInput): string | null {
  const { ig } = input
  if (!ig || !ig.handle) return null
  const sentences: (string | null)[] = []

  // 1. Identidad social + categoría/cuenta.
  const who = ig.displayName ? `${ig.displayName} (@${ig.handle})` : `@${ig.handle}`
  const category = ig.category ? `, ${ig.category},` : ''
  sentences.push(`En Instagram${category} aparece como ${who}.`)

  // 2. Alcance (seguidores / siguiendo / posts).
  const reach: string[] = []
  if (ig.followersCount != null) reach.push(`${fmtCount(ig.followersCount)} seguidores`)
  if (ig.followingCount != null) reach.push(`sigue a ${fmtCount(ig.followingCount)}`)
  if (ig.postsCount != null) reach.push(`${fmtCount(ig.postsCount)} publicaciones`)
  if (reach.length) {
    sentences.push(`Tiene ${reach.join(', ')}.`)
  }

  // 3. Señales de cuenta.
  if (ig.isVerified) sentences.push('Es una cuenta verificada.')
  if (ig.isPrivate) sentences.push('Su cuenta es privada.')

  // 4. Bio (primera oración).
  if (ig.bio) {
    sentences.push(`Su bio dice: "${firstSentence(ig.bio)}".`)
  }

  return joinSentences(sentences)
}
