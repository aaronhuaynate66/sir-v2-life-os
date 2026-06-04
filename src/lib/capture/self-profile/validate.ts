// SIR V2 — Validación + saneo de SelfProfileExtracted (auto-captura propia).
//
// Puro y determinístico. El type guard tolera campos faltantes razonables
// (defaults seguros); el sanitizer recorta, deduplica tags y clampa largos.

import type { Confidence } from '@/lib/capture/observations/types'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import {
  SELF_PROFILE_MAX_TAGS,
  SELF_PROFILE_MAX_BIO,
  SELF_PROFILE_MAX_TRAJECTORY,
  type SelfProfileExtracted,
  type SelfProfileSource,
} from './types'

const SOURCES: ReadonlySet<string> = new Set(['linkedin', 'instagram', 'unknown'])
const CONFIDENCES: ReadonlySet<string> = new Set(['high', 'medium', 'low'])

function isRec(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}

/** Type guard laxo: acepta el JSON del modelo si tiene la forma mínima. Los
 *  campos opcionales que falten se completan con defaults en el sanitizer. */
export function isValidSelfProfileExtracted(x: unknown): boolean {
  if (!isRec(x)) return false
  // confidence es el único campo que exigimos con valor válido (lo usa el flujo
  // de assess/preview). El resto se tolera y se sanea.
  if (typeof x.confidence !== 'string' || !CONFIDENCES.has(x.confidence)) return false
  return true
}

function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const v = item.trim().replace(/^#+/, '').trim()
    if (!v || seen.has(v.toLowerCase())) continue
    seen.add(v.toLowerCase())
    out.push(v)
    if (out.length >= SELF_PROFILE_MAX_TAGS) break
  }
  return out
}

function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (!v) return null
  return v.length > max ? v.slice(0, max).trim() : v
}

/** Acepta una fecha de nacimiento solo si es un date-only válido y plausible
 *  (round-trip de parseLocalDate, año >= 1900). Cualquier otra cosa → null. */
function cleanBirthDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(/^\d{4}-\d{2}-\d{2}/)
  if (!m) return null
  const iso = m[0]
  const d = parseLocalDate(iso)
  if (!d || d.getFullYear() < 1900) return null
  return iso
}

/** Limpia y normaliza el output del extractor a SelfProfileExtracted. */
export function sanitizeSelfProfile(x: unknown): SelfProfileExtracted {
  const r = isRec(x) ? x : {}
  const source: SelfProfileSource = SOURCES.has(r.source as string)
    ? (r.source as SelfProfileSource)
    : 'unknown'
  const confidence: Confidence = CONFIDENCES.has(r.confidence as string)
    ? (r.confidence as Confidence)
    : 'low'
  return {
    source,
    fullName: cleanText(r.fullName, 200),
    birthDate: cleanBirthDate(r.birthDate),
    roles: cleanTags(r.roles),
    location: cleanText(r.location, 200),
    skills: cleanTags(r.skills),
    interests: cleanTags(r.interests),
    bio: cleanText(r.bio, SELF_PROFILE_MAX_BIO),
    trajectory: cleanText(r.trajectory, SELF_PROFILE_MAX_TRAJECTORY),
    imageLegible: r.imageLegible === true,
    confidence,
    rawObservations: cleanText(r.rawObservations, 200),
  }
}
