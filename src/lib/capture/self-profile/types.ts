// SIR V2 — Tipos de la AUTO-CAPTURA del perfil propio.
//
// A diferencia de las capturas de PERSONAS (linkedin/instagram → observations),
// acá Aaron sube screenshots de SU PROPIO LinkedIn/Instagram para que SIR lo
// conozca a ÉL. La extracción apunta directo a las anclas de identidad
// (identity_profile): roles, ubicación, skills, intereses, bio, trayectoria.

import type { Confidence } from '@/lib/capture/observations/types'

/** Qué red parece el screenshot (para ajustar qué campos esperar). */
export type SelfProfileSource = 'linkedin' | 'instagram' | 'unknown'

/** Lo que el extractor saca de UNA imagen del perfil propio. */
export interface SelfProfileExtracted {
  /** Red detectada en la imagen. */
  source: SelfProfileSource
  /** Nombre completo, literal o null si ilegible. */
  fullName: string | null
  /** Roles / ocupación (del headline, experiencia, categoría). Tags. */
  roles: string[]
  /** Ubicación literal ("Lima, Perú") o null. */
  location: string | null
  /** Skills profesionales (sección Skills de LinkedIn). Tags. */
  skills: string[]
  /** Intereses / hobbies (bio de Instagram, highlights, temas). Tags. */
  interests: string[]
  /** Bio / About corto (texto, max ~600 chars) o null. */
  bio: string | null
  /** Educación + experiencia resumida en una línea breve (texto) o null. */
  trajectory: string | null
  /** Calidad de la imagen (aparte de confidence). Captura de página entera /
   *  texto diminuto → false. */
  imageLegible: boolean
  confidence: Confidence
  /** Notas del modelo sobre ambigüedades/cortes (max 200 chars) o null. */
  rawObservations: string | null
}

/** Máximos defensivos para sanitizar las listas (evita explosiones). */
export const SELF_PROFILE_MAX_TAGS = 30
export const SELF_PROFILE_MAX_BIO = 600
export const SELF_PROFILE_MAX_TRAJECTORY = 600
