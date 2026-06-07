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
  // 'scale' SÍ sale de screenshot (panel de báscula inteligente). Lo
  // emite el detector aunque no sea person-centric: el caller lo rutea al
  // flujo de health_metrics en vez del de observations.
  'scale',
  // 'sleep_panel' SÍ sale de screenshot (panel de app de sueño). Igual que
  // scale: el caller lo rutea al flujo self de sleep_records.
  'sleep_panel',
  // 'heart_rate_panel' SÍ sale de screenshot (vista FC > Día). Igual que
  // scale/sleep_panel: el caller lo rutea al flujo self de health_metrics.
  'heart_rate_panel',
  // 'manual_note', 'voice_note', 'unknown' — el detector NO emite los dos
  // primeros (manual/voice no salen de screenshot; unknown si). Permitimos
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

  // Vision a veces emite el enum con whitespace/newline ("scale\n"). Lo
  // toleramos: comparamos contra el set en su forma trimmeada. El sanitize
  // posterior persiste el valor limpio.
  if (typeof x.type !== 'string') return false
  if (!VALID_TYPES.has(x.type.trim() as CaptureType)) return false

  if (typeof x.confidence !== 'string') return false
  if (!VALID_CONFIDENCES.has(x.confidence.trim() as Confidence)) return false

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
    // Normalizamos el enum (el guard ya validó la forma trimmeada).
    type: x.type.trim() as CaptureType,
    confidence: x.confidence.trim() as Confidence,
    reasoning,
    suggestedPersonName,
  }
}
