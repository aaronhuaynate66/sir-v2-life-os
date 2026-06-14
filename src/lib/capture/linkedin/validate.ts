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
  // Tolerante al SHAPE: aceptamos null o cualquier objeto. El path de TEXTO
  // a veces nombra los campos distinto (company/role/organization/position);
  // sanitizeOrgRef los normaliza. Items sin nombre resoluble se descartan ahí.
  if (v === null) return true
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Array de orgRefs tolerante: acepta ausente/no-array (rows viejos, modelo
 *  que omitió el campo) o un array donde cada item valida como orgRef. */
function isValidOrgRefArrayOptional(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (!Array.isArray(v)) return false
  // Cada item debe ser un objeto (shape tolerante); sanitize normaliza/descarta.
  return v.every((item) => !!item && typeof item === 'object' && !Array.isArray(item))
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
  // workHistory / educationHistory: nuevos y tolerantes (rows viejos no los
  // tienen; el modelo puede omitirlos). sanitize los normaliza a []/derivados.
  if (!isValidOrgRefArrayOptional(o.workHistory)) return false
  if (!isValidOrgRefArrayOptional(o.educationHistory)) return false
  // profileUrl: nuevo y tolerante a omisión.
  if ('profileUrl' in o && !isStringOrNull(o.profileUrl)) return false
  // Campos PROPIOS de la captura de imagen (connectionsCount, isOpenToWork,
  // hasProfilePhoto, hasBannerImage, rawObservations, confidence): el path de
  // TEXTO pegado NO los provee. Toleramos su ausencia (solo invalidan si vienen
  // con tipo errado); sanitize los normaliza con defaults seguros.
  if ('connectionsCount' in o && !isNonNegIntOrNull(o.connectionsCount)) return false
  if ('isOpenToWork' in o && typeof o.isOpenToWork !== 'boolean') return false
  if ('hasProfilePhoto' in o && typeof o.hasProfilePhoto !== 'boolean') return false
  if ('hasBannerImage' in o && typeof o.hasBannerImage !== 'boolean') return false
  if ('imageLegible' in o && typeof o.imageLegible !== 'boolean') return false
  if ('confidence' in o && (typeof o.confidence !== 'string' || !VALID_CONFIDENCES.has(o.confidence as Confidence))) return false
  if ('rawObservations' in o && !isStringOrNull(o.rawObservations)) return false

  return true
}

function trimOrNull(v: string | null, maxLen: number): string | null {
  if (v === null) return null
  const t = v.trim()
  return t.length === 0 ? null : t.slice(0, maxLen)
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

function sanitizeOrgRef(v: LinkedInOrgRef | null): LinkedInOrgRef | null {
  if (v === null || typeof v !== 'object') return null
  const o = v as unknown as Record<string, unknown>
  // Nombre de la empresa/institución: tolera variantes de naming del modelo.
  const name = (pickStr(o, ['name', 'company', 'organization', 'institution', 'school', 'employer']) ?? '').slice(0, 200)
  if (name.length === 0) return null
  return {
    name,
    title: (pickStr(o, ['title', 'role', 'position', 'degree', 'program', 'cargo']) ?? '').slice(0, 200) || null,
    dateRange: (pickStr(o, ['dateRange', 'dates', 'period', 'duration', 'rango']) ?? '').slice(0, 80) || null,
  }
}

/** Máximo de entradas que guardamos por historial (defensa contra prompts
 *  que devuelven listas enormes; un perfil real rara vez supera esto). */
const MAX_HISTORY_ENTRIES = 12

/** Sanitiza una lista de orgRefs: dropea inválidas/vacías, dedupe por
 *  name+title, clampa al máximo. Tolerante a entradas no-array. */
function sanitizeOrgRefList(v: unknown): LinkedInOrgRef[] {
  if (!Array.isArray(v)) return []
  const out: LinkedInOrgRef[] = []
  const seen = new Set<string>()
  for (const item of v) {
    const ref = sanitizeOrgRef((item ?? null) as LinkedInOrgRef | null)
    if (!ref) continue
    const key = `${ref.name.toLowerCase()}|${(ref.title ?? '').toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
    if (out.length >= MAX_HISTORY_ENTRIES) break
  }
  return out
}

/** Normaliza una URL de perfil de LinkedIn construida por el modelo. Acepta
 *  solo formas reconocibles (URL linkedin.com/in/... o "in/<slug>"); cualquier
 *  otra cosa -> null (anti-invención: no construimos URL desde el nombre). */
function normalizeLinkedinProfileUrl(v: string | null): string | null {
  const t = trimOrNull(v, 300)
  if (!t) return null
  // Caso URL completa o sin esquema con dominio linkedin.
  const m = t.match(/linkedin\.com\/in\/([^/?#\s]+)/i)
  if (m) return `https://linkedin.com/in/${m[1].replace(/\/+$/, '')}`
  // Caso "in/<slug>" suelto.
  const m2 = t.match(/^in\/([^/?#\s]+)/i)
  if (m2) return `https://linkedin.com/in/${m2[1].replace(/\/+$/, '')}`
  return null
}

export function sanitizeLinkedInProfile(
  raw: LinkedInProfileExtracted,
): LinkedInProfileExtracted {
  // Historiales completos (gema V1). Pueden venir ausentes (rows viejos /
  // modelo que omitió) — sanitizeOrgRefList tolera no-array -> [].
  const rawRec = raw as unknown as Record<string, unknown>
  let workHistory = sanitizeOrgRefList(rawRec.workHistory)
  let educationHistory = sanitizeOrgRefList(rawRec.educationHistory)

  // Reconciliación bidireccional latest* <-> history (compat total):
  //  - latest* = primer item del history si el modelo no lo dio aparte.
  //  - si vino latest* pero el history quedó vacío, sembramos el history con él
  //    (así los readers nuevos que consumen arrays ven la entrada).
  const sanitizedLatestExp = sanitizeOrgRef(raw.latestExperience)
  const sanitizedLatestEdu = sanitizeOrgRef(raw.latestEducation)
  const latestExperience = workHistory[0] ?? sanitizedLatestExp
  const latestEducation = educationHistory[0] ?? sanitizedLatestEdu
  if (workHistory.length === 0 && sanitizedLatestExp) workHistory = [sanitizedLatestExp]
  if (educationHistory.length === 0 && sanitizedLatestEdu) educationHistory = [sanitizedLatestEdu]

  return {
    fullName: trimOrNull(raw.fullName, 200),
    headline: trimOrNull(raw.headline, 300),
    location: trimOrNull(raw.location, 200),
    currentRole: trimOrNull(raw.currentRole, 200),
    currentCompany: trimOrNull(raw.currentCompany, 200),
    about: trimOrNull(raw.about, 2000),
    latestExperience,
    latestEducation,
    workHistory,
    educationHistory,
    profileUrl: normalizeLinkedinProfileUrl((rawRec.profileUrl as string | null) ?? null),
    // Campos de imagen: defaults seguros cuando el path de texto los omite.
    connectionsCount: isNonNegIntOrNull(rawRec.connectionsCount) ? (rawRec.connectionsCount as number | null) : null,
    isOpenToWork: rawRec.isOpenToWork === true,
    hasProfilePhoto: rawRec.hasProfilePhoto === true,
    hasBannerImage: rawRec.hasBannerImage === true,
    imageLegible: rawRec.imageLegible === false ? false : true,
    confidence: VALID_CONFIDENCES.has(raw.confidence as Confidence) ? raw.confidence : 'medium',
    rawObservations: trimOrNull((rawRec.rawObservations as string | null) ?? null, 240),
  }
}
