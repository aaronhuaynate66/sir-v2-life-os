// SIR V2 — Tipos del extractor LinkedIn profile.
//
// Captura: pantalla de PERFIL de LinkedIn (no feed, no post).
// Layout esperado: foto profesional + nombre + headline (cargo + empresa)
// + location + botones Connect/Message + secciones Experience/Education/About.
//
// Materializado como `data` JSON dentro de un row observations con
// capture_type='linkedin'.

import type { Confidence } from '../observations/types'

/** Entrada simple de educacion/empresa cuando es legible. */
export interface LinkedInOrgRef {
  /** Nombre de la empresa o institucion. */
  name: string
  /** Cargo / titulo de grado / programa, si esta visible. null si no. */
  title: string | null
  /** Rango temporal literal como aparece ("2021 - Present", "2019 - 2021").
   *  null si no es legible. */
  dateRange: string | null
}

export interface LinkedInProfileExtracted {
  /** Nombre completo como aparece grande. Literal. */
  fullName: string
  /** Headline (una linea con cargo + empresa). Copia literal. null si no. */
  headline: string | null
  /** Ubicacion (linea pequeña debajo del headline). null si no. */
  location: string | null
  /** Cargo extraido del headline (mejor esfuerzo). Suele ser la parte antes
   *  de "en" / "at". null si no se puede separar limpiamente. */
  currentRole: string | null
  /** Empresa actual extraida del headline. null si no se puede separar. */
  currentCompany: string | null
  /** Texto de la seccion "About" / "Acerca de" si esta visible. null si no. */
  about: string | null
  /** Entrada mas reciente de Experience visible. null si no se ve la seccion. */
  latestExperience: LinkedInOrgRef | null
  /** Entrada mas reciente de Education visible. null si no se ve. */
  latestEducation: LinkedInOrgRef | null
  /** Numero de conexiones si la metrica esta visible ("500+ connections",
   *  "1,234 followers"). Devolver el entero (500+ -> 500). null si no esta. */
  connectionsCount: number | null
  /** True si la cuenta tiene "Open to work" / disponible visible. */
  isOpenToWork: boolean
  /** True si hay foto de perfil real (no avatar default). */
  hasProfilePhoto: boolean
  /** True si hay banner / cover image personalizado. */
  hasBannerImage: boolean
  confidence: Confidence
  rawObservations: string | null
}

export interface LinkedInExtractorError {
  error: string
  detail?: string
}
