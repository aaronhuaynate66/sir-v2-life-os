// SIR V2 — Validacion runtime del DetectorResult.
//
// Type guards manuales (sin zod) en linea con el patron del repo
// (validate.ts de capture/whatsapp). El endpoint /api/capture parsea
// el output de Vision y lo pasa por isValidDetectorResult antes de
// confiarse del shape.

import type { CaptureType, Confidence, DetectorResult } from '../observations/types'

const VALID_TYPES: ReadonlySet<CaptureType> = new Set<CaptureType>([
  'whatsapp_chat',
  'whatsapp_web',
  'whatsapp_info',
  'instagram',
  'linkedin',
  // 'manual_note', 'voice_note', 'unknown' — el detector NO emite estos
  // tres (manual/voice no salen de screenshot; unknown si). Permitimos
  // unknown porque es output legitimo del prompt cuando nada matchea.
  'unknown',
])

const VALID_CONFIDENCES: ReadonlySet<Confidence> = new Set<Confidence>([
  'high',
  'medium',
  'low',
])

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/**
 * True si `x` tiene la shape exacta de DetectorResult. Permisivo con
 * suggestedPersonName: acepta null o string trimable. Strict con type
 * y confidence: deben venir del enum.
 */
export function isValidDetectorResult(x: unknown): x is DetectorResult {
  if (!isRecord(x)) return false

  if (typeof x.type !== 'string') return false
  if (!VALID_TYPES.has(x.type as CaptureType)) return false

  if (typeof x.confidence !== 'string') return false
  if (!VALID_CONFIDENCES.has(x.confidence as Confidence)) return false

  if (typeof x.reasoning !== 'string') return false

  if (x.suggestedPersonName !== null && typeof x.suggestedPersonName !== 'string') {
    return false
  }

  return true
}

/**
 * Normaliza un DetectorResult valido: trims, clamps de longitud,
 * suggestedPersonName='' -> null.
 */
export function sanitizeDetectorResult(x: DetectorResult): DetectorResult {
  const reasoning = x.reasoning.trim().slice(0, 200)
  const namedRaw = typeof x.suggestedPersonName === 'string' ? x.suggestedPersonName.trim() : null
  const suggestedPersonName = namedRaw && namedRaw.length > 0 ? namedRaw.slice(0, 200) : null
  return {
    type: x.type,
    confidence: x.confidence,
    reasoning,
    suggestedPersonName,
  }
}
