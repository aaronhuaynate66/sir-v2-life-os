// SIR V2 — Validacion runtime del JSON WhatsAppInfoExtracted.
//
// Type guard manual + sanitize, mismo patron que whatsapp/validate.ts.

import type { Confidence } from '../observations/types'
import type { WhatsAppInfoExtracted } from './types'

const VALID_CONFIDENCES: ReadonlySet<Confidence> = new Set<Confidence>([
  'high',
  'medium',
  'low',
])

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}

function isIntOrNull(v: unknown): v is number | null {
  if (v === null) return true
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

export function isValidWhatsAppInfoExtracted(x: unknown): x is WhatsAppInfoExtracted {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>

  if (typeof o.displayName !== 'string') return false
  if (!isStringOrNull(o.phoneNumber)) return false
  if (!isStringOrNull(o.aboutText)) return false
  if (!isStringOrNull(o.lastSeen)) return false
  if (!isIntOrNull(o.groupsInCommonCount)) return false
  if (!isIntOrNull(o.contactsInCommonCount)) return false
  if (typeof o.hasProfilePhoto !== 'boolean') return false
  if (typeof o.isBusinessAccount !== 'boolean') return false
  if (typeof o.confidence !== 'string') return false
  if (!VALID_CONFIDENCES.has(o.confidence as Confidence)) return false
  if (!isStringOrNull(o.rawObservations)) return false

  return true
}

/** Trim + clamps + normalizacion '' -> null. */
export function sanitizeWhatsAppInfo(raw: WhatsAppInfoExtracted): WhatsAppInfoExtracted {
  const trimOrNull = (v: string | null, maxLen: number): string | null => {
    if (v === null) return null
    const t = v.trim()
    return t.length === 0 ? null : t.slice(0, maxLen)
  }

  return {
    displayName: raw.displayName.trim().slice(0, 200),
    phoneNumber: trimOrNull(raw.phoneNumber, 50),
    aboutText: trimOrNull(raw.aboutText, 500),
    lastSeen: trimOrNull(raw.lastSeen, 120),
    groupsInCommonCount: raw.groupsInCommonCount,
    contactsInCommonCount: raw.contactsInCommonCount,
    hasProfilePhoto: raw.hasProfilePhoto,
    isBusinessAccount: raw.isBusinessAccount,
    confidence: raw.confidence,
    rawObservations: trimOrNull(raw.rawObservations, 240),
  }
}
