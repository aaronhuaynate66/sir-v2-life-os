// SIR V2 — Validacion runtime del JSON InstagramProfileExtracted.

import type { Confidence } from '../observations/types'
import type { InstagramProfileExtracted } from './types'

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

export function isValidInstagramProfileExtracted(x: unknown): x is InstagramProfileExtracted {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>

  if (typeof o.handle !== 'string') return false
  if (!isStringOrNull(o.displayName)) return false
  if (!isStringOrNull(o.bio)) return false
  if (!isStringOrNull(o.externalLink)) return false
  if (!isStringOrNull(o.pronouns)) return false
  if (!isStringOrNull(o.category)) return false
  if (!isNonNegIntOrNull(o.postsCount)) return false
  if (!isNonNegIntOrNull(o.followersCount)) return false
  if (!isNonNegIntOrNull(o.followingCount)) return false
  if (typeof o.isVerified !== 'boolean') return false
  if (typeof o.isPrivate !== 'boolean') return false
  if (typeof o.hasProfilePhoto !== 'boolean') return false
  if (typeof o.confidence !== 'string') return false
  if (!VALID_CONFIDENCES.has(o.confidence as Confidence)) return false
  if (!isStringOrNull(o.rawObservations)) return false

  return true
}

/** Trim + clamps + normalizacion '@handle' -> 'handle' y '' -> null. */
export function sanitizeInstagramProfile(
  raw: InstagramProfileExtracted,
): InstagramProfileExtracted {
  const trimOrNull = (v: string | null, maxLen: number): string | null => {
    if (v === null) return null
    const t = v.trim()
    return t.length === 0 ? null : t.slice(0, maxLen)
  }

  // Normalizar handle: quitar '@' inicial si vino, trim, lowercase NO (handles
  // mantienen capitalizacion).
  let handle = raw.handle.trim()
  if (handle.startsWith('@')) handle = handle.slice(1)
  handle = handle.slice(0, 100)

  return {
    handle,
    displayName: trimOrNull(raw.displayName, 200),
    bio: trimOrNull(raw.bio, 1500),
    externalLink: trimOrNull(raw.externalLink, 500),
    pronouns: trimOrNull(raw.pronouns, 50),
    category: trimOrNull(raw.category, 120),
    postsCount: raw.postsCount,
    followersCount: raw.followersCount,
    followingCount: raw.followingCount,
    isVerified: raw.isVerified,
    isPrivate: raw.isPrivate,
    hasProfilePhoto: raw.hasProfilePhoto,
    confidence: raw.confidence,
    rawObservations: trimOrNull(raw.rawObservations, 240),
  }
}
