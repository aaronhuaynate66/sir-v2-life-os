// SIR V2 — Validacion runtime del JSON LinkedInProfileExtracted.

import type { Confidence } from '../observations/types'
import type { LinkedInOrgRef, LinkedInProfileExtracted } from './types'

const VALID_CONFIDENCES: ReadonlySet<Confidence> = new Set<Confidence>([
  'high',
  'medium',
  'low',
])

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}

function isNonNegIntOrNull(v: unknown): v is number | null {
  if (v === null) return true
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0
}

function isValidOrgRefOrNull(v: unknown): v is LinkedInOrgRef | null {
  if (v === null) return true
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (typeof o.name !== 'string') return false
  if (!isStringOrNull(o.title)) return false
  if (!isStringOrNull(o.dateRange)) return false
  return true
}

export function isValidLinkedInProfileExtracted(x: unknown): x is LinkedInProfileExtracted {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>

  if (!isStringOrNull(o.fullName)) return false
  if (!isStringOrNull(o.headline)) return false
  if (!isStringOrNull(o.location)) return false
  if (!isStringOrNull(o.currentRole)) return false
  if (!isStringOrNull(o.currentCompany)) return false
  if (!isStringOrNull(o.about)) return false
  if (!isValidOrgRefOrNull(o.latestExperience)) return false
  if (!isValidOrgRefOrNull(o.latestEducation)) return false
  if (!isNonNegIntOrNull(o.connectionsCount)) return false
  if (typeof o.isOpenToWork !== 'boolean') return false
  if (typeof o.hasProfilePhoto !== 'boolean') return false
  if (typeof o.hasBannerImage !== 'boolean') return false
  // imageLegible: tolerante — el modelo podría omitirlo. No invalida la
  // extracción si falta; sanitize lo normaliza (omitido → true, backstop de
  // dimensiones client-side cubre el caso página-entera).
  if ('imageLegible' in o && typeof o.imageLegible !== 'boolean') return false
  if (typeof o.confidence !== 'string') return false
  if (!VALID_CONFIDENCES.has(o.confidence as Confidence)) return false
  if (!isStringOrNull(o.rawObservations)) return false

  return true
}

function trimOrNull(v: string | null, maxLen: number): string | null {
  if (v === null) return null
  const t = v.trim()
  return t.length === 0 ? null : t.slice(0, maxLen)
}

function sanitizeOrgRef(v: LinkedInOrgRef | null): LinkedInOrgRef | null {
  if (v === null) return null
  const name = v.name.trim().slice(0, 200)
  if (name.length === 0) return null
  return {
    name,
    title: trimOrNull(v.title, 200),
    dateRange: trimOrNull(v.dateRange, 80),
  }
}

export function sanitizeLinkedInProfile(
  raw: LinkedInProfileExtracted,
): LinkedInProfileExtracted {
  return {
    fullName: trimOrNull(raw.fullName, 200),
    headline: trimOrNull(raw.headline, 300),
    location: trimOrNull(raw.location, 200),
    currentRole: trimOrNull(raw.currentRole, 200),
    currentCompany: trimOrNull(raw.currentCompany, 200),
    about: trimOrNull(raw.about, 2000),
    latestExperience: sanitizeOrgRef(raw.latestExperience),
    latestEducation: sanitizeOrgRef(raw.latestEducation),
    connectionsCount: raw.connectionsCount,
    isOpenToWork: raw.isOpenToWork,
    hasProfilePhoto: raw.hasProfilePhoto,
    hasBannerImage: raw.hasBannerImage,
    // Omitido o no-boolean → true (legible); solo un false explícito corta.
    // El guard de dimensiones client-side respalda el caso página-entera.
    imageLegible: raw.imageLegible === false ? false : true,
    confidence: raw.confidence,
    rawObservations: trimOrNull(raw.rawObservations, 240),
  }
}
