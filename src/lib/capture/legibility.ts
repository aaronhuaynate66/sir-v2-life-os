// SIR V2 — Evaluación de legibilidad de una extracción (lógica pura).
//
// Fuente del bug LinkedIn: una captura de página entera (letra diminuta) sale
// con confianza baja o casi sin campos legibles, pero igual mostraba campos
// garabateados como válidos. Acá decidimos, combinando la confianza que ya
// devuelve el extractor + una heurística simple de "cuántos campos con
// sustancia se leyeron":
//
//   - 'unreadable' → no pude leer bien (confianza baja, o 0 campos con
//     sustancia). NO mostrar campos garabateados: cortar con un mensaje claro.
//   - 'review'     → dudoso (confianza media/desconocida, o 1 solo campo):
//     mostrar para que el usuario revise/confirme antes de guardar.
//   - 'ok'         → alta confianza + varios campos: puede guardar directo.

import type { Confidence } from './observations/types'

/** Claves que NO cuentan como "campo con sustancia" (flags/meta). */
const NON_SUBSTANTIVE = new Set([
  'confidence',
  'rawObservations',
  'isVerified',
  'isPrivate',
  'isOpenToWork',
  'hasProfilePhoto',
  'hasBannerImage',
])

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

/**
 * Decide qué hacer con una extracción según confianza + campos legibles.
 * Pura. La UI corta en 'unreadable', revisa en 'review', guarda en 'ok'.
 */
export function assessExtraction(
  extracted: Record<string, unknown>,
  confidence: Confidence | null,
): ExtractionVerdict {
  const fields = meaningfulFieldCount(extracted)
  // Ilegible: confianza baja o nada con sustancia (no mostrar basura).
  if (confidence === 'low' || fields === 0) return 'unreadable'
  // Dudoso: confianza media/desconocida o un único campo → revisar.
  if (confidence === 'medium' || confidence == null || fields <= 1) return 'review'
  return 'ok' // confianza alta + ≥2 campos con sustancia
}
