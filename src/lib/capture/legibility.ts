// SIR V2 — Evaluación de legibilidad de una extracción (lógica pura).
//
// Fuente del bug LinkedIn: una captura de página entera (letra diminuta) sale
// con campos garabateados, pero igual mostraba esos campos como válidos.
//
// LECCIÓN (01/06): el LLM reportó confidence='high' sobre una lectura
// EQUIVOCADA de una imagen ilegible (Mercadóloga / "PREFABRICADOS DE
// NEGOCIOS" / "Bachiller Administrativo del Marketing"). O sea: la confianza
// que devuelve el modelo NO es confiable por sí sola. Por eso combinamos
// TRES señales, dos de ellas independientes del juicio de contenido del LLM:
//
//   1. confidence del extractor (señal débil: puede mentir).
//   2. imageLegible: flag que el prompt pide aparte ("¿la imagen era nítida?",
//      independiente de qué tan seguro estás del contenido). false → cortar.
//   3. dimensiones de la imagen (MODELO-INDEPENDIENTE): una captura de página
//      entera de un perfil es muy alta (height ≫ width) → letra diminuta.
//   + heurística de "cuántos campos con sustancia se leyeron".
//
//   - 'unreadable' → cortar con mensaje claro (no mostrar basura).
//   - 'review'     → dudoso: mostrar para revisar/confirmar antes de guardar.
//   - 'ok'         → alta confianza + varios campos + nítida: guardar directo.

import type { CaptureType, Confidence } from './observations/types'

/** Claves que NO cuentan como "campo con sustancia" (flags/meta). */
const NON_SUBSTANTIVE = new Set([
  'confidence',
  'imageLegible',
  'rawObservations',
  'isVerified',
  'isPrivate',
  'isOpenToWork',
  'hasProfilePhoto',
  'hasBannerImage',
])

export interface ImageDims {
  width: number
  height: number
}

/**
 * ¿La imagen parece una captura de PÁGINA ENTERA de un perfil (todo el
 * perfil en una sola imagen muy alta → letra diminuta)? Señal
 * MODELO-INDEPENDIENTE: no depende de lo que el LLM crea haber leído.
 *
 * Una sola pantalla de teléfono ronda ratio 2.0–2.2 (390×844 ≈ 2.16). Una
 * captura de scroll/página entera es bastante más alta. Umbral conservador
 * (3.0) para no castigar una captura de pantalla única legítima; preferimos
 * un corte de más (recapturar) a tragar basura (Aaron: "prefiero no tener
 * datos a tener datos falsos").
 */
export function looksLikeFullPageProfileCapture(
  dims: ImageDims | null | undefined,
  captureType: CaptureType,
): boolean {
  if (!dims || !dims.width || !dims.height) return false
  const isProfile = captureType === 'linkedin' || captureType === 'instagram'
  if (!isProfile) return false
  const ratio = dims.height / dims.width
  return ratio >= 3.0
}

function hasText(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length >= 2
  if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x.trim().length >= 2)
  if (v && typeof v === 'object') {
    return Object.values(v as Record<string, unknown>).some(
      (x) => typeof x === 'string' && x.trim().length >= 2,
    )
  }
  return false
}

/** Cuenta campos con texto sustantivo (ignora flags/meta). */
export function meaningfulFieldCount(extracted: Record<string, unknown>): number {
  let n = 0
  for (const [k, v] of Object.entries(extracted)) {
    if (NON_SUBSTANTIVE.has(k)) continue
    if (hasText(v)) n++
  }
  return n
}

export type ExtractionVerdict = 'ok' | 'review' | 'unreadable'

export interface AssessOptions {
  /** Dimensiones de la imagen ORIGINAL subida (señal modelo-independiente). */
  dims?: ImageDims | null
  /** Tipo de captura (para el guard de página entera). */
  captureType?: CaptureType
}

/**
 * Decide qué hacer con una extracción. Pura. La UI corta en 'unreadable',
 * revisa en 'review', guarda en 'ok'.
 *
 * Señales que fuerzan 'unreadable' SIN importar la confianza del LLM (que
 * puede mentir — reportó 'high' sobre basura):
 *   - extracted.imageLegible === false (el prompt lo evalúa aparte).
 *   - la imagen parece una captura de página entera (height ≫ width).
 */
export function assessExtraction(
  extracted: Record<string, unknown>,
  confidence: Confidence | null,
  opts: AssessOptions = {},
): ExtractionVerdict {
  // Señal 1 (modelo, pero pregunta distinta a "confidence"): el extractor
  // dice explícitamente que la imagen NO era legible → cortar.
  if (extracted.imageLegible === false) return 'unreadable'
  // Señal 2 (MODELO-INDEPENDIENTE): captura de página entera → letra diminuta,
  // aunque el LLM jure confianza alta → cortar.
  if (opts.captureType && looksLikeFullPageProfileCapture(opts.dims, opts.captureType)) {
    return 'unreadable'
  }

  const fields = meaningfulFieldCount(extracted)
  // Ilegible: confianza baja o nada con sustancia (no mostrar basura).
  if (confidence === 'low' || fields === 0) return 'unreadable'
  // Dudoso: confianza media/desconocida o un único campo → revisar.
  if (confidence === 'medium' || confidence == null || fields <= 1) return 'review'
  return 'ok' // confianza alta + ≥2 campos con sustancia
}
