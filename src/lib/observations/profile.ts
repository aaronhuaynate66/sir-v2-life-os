// SIR V2 — Lectura tipada de observations de PERFIL (linkedin / instagram).
//
// Los paneles "Vida profesional" (#6) y "Vida social" (#7) del detail page
// rinden la `data` estructurada de la observation de perfil más reciente.
// observations.data es Record<string, unknown> (shape per capture_type),
// así que coercionamos acá de forma defensiva — nunca confiamos en que un
// campo exista o tenga el tipo correcto (rows viejas, extracción parcial).
//
// Render DETERMINÍSTICO (sin LLM): los extractores LinkedIn/Instagram ya
// produjeron campos estructurados; acá solo los leemos y formateamos.
// Mismo criterio que BirthdayCountdown / CicloPanel.

import type { Observation, CaptureType } from '@/lib/capture/observations/types'
import type {
  LinkedInProfileExtracted,
  LinkedInOrgRef,
} from '@/lib/capture/linkedin/types'
import type { InstagramProfileExtracted } from '@/lib/capture/instagram/types'
import {
  parseMutualFollowers,
  type InstagramMutualFollowers,
} from '@/lib/capture/instagram/mutual'

/** La observation más reciente de un capture_type dado. Asume `observations`
 *  ya ordenadas por observed_at DESC (contrato de getObservationsForPerson),
 *  así que el primer match es el más nuevo. null si no hay ninguna. */
export function latestOfType(
  observations: Observation[],
  captureType: CaptureType,
): Observation | null {
  return observations.find((o) => o.captureType === captureType) ?? null
}

// ─── coerciones primitivas ──────────────────────────────────────────
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function bool(v: unknown): boolean {
  return v === true
}
/** Coerciona el bloque de seguidores en común. Prefiere la estructura ya
 *  persistida (`mutualFollowers`); si no es válida, reparsea el texto literal
 *  (`mutualFollowersText`) — así rows viejas o parciales también funcionan.
 *  null si no hay nada legible. */
function mutualFollowers(data: Record<string, unknown>): InstagramMutualFollowers | null {
  const raw = data.mutualFollowers
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    const named = Array.isArray(r.named)
      ? r.named.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      : []
    const totalCount = num(r.totalCount)
    if (named.length > 0 || totalCount !== null) return { named, totalCount }
  }
  // Fallback: reparsear la línea literal si la estructura no estaba.
  const text = str(data.mutualFollowersText)
  if (text) {
    const parsed = parseMutualFollowers(text)
    if (parsed.named.length > 0 || parsed.totalCount !== null) return parsed
  }
  return null
}

function orgRef(v: unknown): LinkedInOrgRef | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const name = str(r.name)
  if (!name) return null
  return { name, title: str(r.title), dateRange: str(r.dateRange) }
}

/** Coerciona observations.data (linkedin) a un shape parcial seguro. */
export function readLinkedIn(data: Record<string, unknown>): Partial<LinkedInProfileExtracted> {
  return {
    fullName: str(data.fullName),
    headline: str(data.headline),
    location: str(data.location),
    currentRole: str(data.currentRole),
    currentCompany: str(data.currentCompany),
    about: str(data.about),
    latestExperience: orgRef(data.latestExperience),
    latestEducation: orgRef(data.latestEducation),
    connectionsCount: num(data.connectionsCount),
    isOpenToWork: bool(data.isOpenToWork),
    hasProfilePhoto: bool(data.hasProfilePhoto),
    hasBannerImage: bool(data.hasBannerImage),
  }
}

/** Coerciona observations.data (instagram) a un shape parcial seguro. */
export function readInstagram(data: Record<string, unknown>): Partial<InstagramProfileExtracted> {
  return {
    handle: str(data.handle) ?? undefined,
    displayName: str(data.displayName),
    bio: str(data.bio),
    externalLink: str(data.externalLink),
    pronouns: str(data.pronouns),
    category: str(data.category),
    postsCount: num(data.postsCount),
    followersCount: num(data.followersCount),
    followingCount: num(data.followingCount),
    isVerified: bool(data.isVerified),
    isPrivate: bool(data.isPrivate),
    hasProfilePhoto: bool(data.hasProfilePhoto),
    mutualFollowersText: str(data.mutualFollowersText),
    mutualFollowers: mutualFollowers(data),
  }
}

/** Formatea un entero grande con separadores ("1,374"). null -> "—". */
export function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('es').format(n)
}

/**
 * Resumen profesional de UNA línea (rol + empresa, o headline). Determinístico.
 * NO incluye educación a propósito: la educación se muestra en su propia línea
 * reconciliada (ver `reconcileEducation` en ./education), donde LinkedIn manda
 * sobre el nivel de registro/RENIEC. Devuelve null si no hay material suficiente.
 */
export function professionalSummary(li: Partial<LinkedInProfileExtracted>): string | null {
  if (li.currentRole && li.currentCompany) return `${li.currentRole} en ${li.currentCompany}`
  if (li.currentRole) return li.currentRole
  if (li.headline) return li.headline
  return null
}
