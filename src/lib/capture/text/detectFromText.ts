// SIR V2 — Detección de tipo de perfil desde TEXTO pegado (lógica pura).
//
// Captura por texto: el usuario pega el texto del perfil (LinkedIn/Instagram)
// en vez de subir una imagen → extracción exacta, sin Visión/OCR, sin el
// problema de las capturas ilegibles. Acá decidimos QUÉ extractor usar a
// partir de marcadores característicos del texto. Pura + determinística +
// testeable; cero red, cero LLM.

import type { CaptureType, Confidence, DetectorResult } from '../observations/types'

export type TextProfileType = 'linkedin' | 'instagram'

export interface TextDetection {
  /** Tipo detectado, o 'unknown' si no hay señal suficiente. */
  type: TextProfileType | 'unknown'
  confidence: Confidence
  /** Pista corta de por qué se decidió (para UI/debug). */
  reasoning: string
  /** Scores crudos (para tests/UX). */
  scores: { linkedin: number; instagram: number }
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca acentos/diacríticos combinantes
    .toLowerCase()
}

/** Marcadores fuertes de LinkedIn (perfil profesional). */
const LINKEDIN_MARKERS = [
  'conexiones',
  'connections',
  'experiencia',
  'experience',
  'aptitudes',
  'aptitudes principales',
  'skills',
  'acerca de',
  'licencias y certificaciones',
  'licenses & certifications',
  'recomendaciones',
  'recommendations',
  'ver perfil completo',
  'actividad',
  'formacion',
  'education',
  'lo que hago',
  'er grado', // "1.er grado", "2.º grado"
  'grado de conexion',
] as const

/** Marcadores fuertes de Instagram. */
const INSTAGRAM_MARKERS = [
  'publicaciones',
  'posts',
  'seguidos',
  'siguiendo',
  'following',
  'editar perfil',
  'edit profile',
  'historias destacadas',
  'story highlights',
  'reels',
  'etiquetadas',
  'tagged',
  'enviar mensaje',
  'message',
] as const

function countMarkers(haystack: string, markers: readonly string[]): number {
  let n = 0
  for (const m of markers) {
    if (haystack.includes(m)) n++
  }
  return n
}

/**
 * Detecta el tipo de perfil desde el texto pegado. Heurística por marcadores:
 * cuenta señales características de cada plataforma y elige la dominante. La
 * confianza refleja el margen (no "lo seguro que está un modelo").
 *
 * 'seguidores'/'followers' NO se usa como marcador: aparece en ambos
 * (LinkedIn también muestra followers) → no discrimina.
 */
export function detectCaptureTypeFromText(text: string): TextDetection {
  const h = normalize(text)
  const linkedin = countMarkers(h, LINKEDIN_MARKERS)
  const instagram = countMarkers(h, INSTAGRAM_MARKERS)
  const scores = { linkedin, instagram }

  if (linkedin === 0 && instagram === 0) {
    return {
      type: 'unknown',
      confidence: 'low',
      reasoning: 'Sin marcadores claros de LinkedIn ni Instagram.',
      scores,
    }
  }

  const type: TextProfileType = linkedin >= instagram ? 'linkedin' : 'instagram'
  const winner = Math.max(linkedin, instagram)
  const loser = Math.min(linkedin, instagram)
  const margin = winner - loser

  // Confianza por margen: claro (>=2 y domina) → high; algo de señal → medium.
  const confidence: Confidence = winner >= 2 && margin >= 2 ? 'high' : margin >= 1 ? 'medium' : 'low'

  const label = type === 'linkedin' ? 'LinkedIn' : 'Instagram'
  return {
    type,
    confidence,
    reasoning: `${label} por marcadores (li=${linkedin}, ig=${instagram}).`,
    scores,
  }
}

/**
 * DetectorResult sintético para `detector_data` en el row observations cuando
 * la fuente es texto pegado (no hubo detector de Visión). Si el texto es
 * ambiguo, cae a `fallback` (default 'linkedin', el perfil profesional más
 * común para captura manual).
 */
export function detectorResultFromText(
  text: string,
  fallback: TextProfileType = 'linkedin',
): DetectorResult {
  const d = detectCaptureTypeFromText(text)
  const type: CaptureType = d.type === 'unknown' ? fallback : d.type
  return {
    type,
    confidence: d.confidence,
    reasoning: `texto pegado — ${d.reasoning}`.slice(0, 200),
    suggestedPersonName: null,
  }
}
