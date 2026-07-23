// SIR V2 — Evaluación de calidad de cara para el auto-avatar. PURO.
//
// El auto-avatar antes se quedaba con la PRIMERA captura que diera cualquier
// "foto de perfil", aunque fuera un paisaje o cuerpo entero con la cara diminuta
// (Diana en la playa, Dayana en un pasillo) → referencias sin cara que rompían
// el match por cara. Ahora la visión evalúa cada candidata (cara nítida + de
// frente + una sola persona) y este módulo la puntúa; el endpoint elige la MEJOR
// y descarta las que no tienen una cara clara.

import type { DetectBox } from './cropRect'

export interface FaceAssessment {
  /** Hay una cara humana real (no solo un recuadro de "foto de perfil"). */
  found: boolean
  /** Caja de la CARA/cabeza, normalizada 0..1. null si no hay. */
  box: DetectBox | null
  /** La cara mira aprox. hacia la cámara (no de perfil/de espaldas). */
  frontal: boolean
  /** Qué tan reconocible es: 'clear' grande y nítida, 'partial' chica/parcial. */
  clarity: 'clear' | 'partial' | 'none'
  /** Cuántas caras se ven (para evitar fotos de grupo como avatar). */
  faceCount: number
}

/** Puntaje mínimo para aceptar una candidata como avatar. Debajo → se descarta
 *  (mejor sin avatar que una referencia sin cara clara). */
export const MIN_FACE_SCORE = 60

/** Área mínima de la caja de la cara (fracción de la imagen). Señal INDEPENDIENTE
 *  del juicio del modelo: en un screenshot de perfil escénico la cara sale
 *  diminuta (área ~0.02); una foto-cara de verdad la tiene grande (área ≥0.05).
 *  El modelo sobredeclara "clara" para caras chicas → esto lo corrige por geometría. */
export const MIN_FACE_AREA = 0.05

/** Parsea la respuesta JSON de la visión a una evaluación. Conservador: si algo
 *  no cuadra, devuelve una evaluación "sin cara" (found:false). */
export function parseFaceAssessment(raw: string): FaceAssessment {
  const none: FaceAssessment = { found: false, box: null, frontal: false, clarity: 'none', faceCount: 0 }
  if (!raw) return none
  try {
    const s = raw.indexOf('{')
    const e = raw.lastIndexOf('}')
    if (s < 0 || e <= s) return none
    const p = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>
    const found = p.found === true
    const clarity = p.clarity === 'clear' ? 'clear' : p.clarity === 'partial' ? 'partial' : 'none'
    const frontal = p.frontal === true
    const faceCount = typeof p.faceCount === 'number' && Number.isFinite(p.faceCount) ? Math.max(0, Math.round(p.faceCount)) : (found ? 1 : 0)
    const cl = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null)
    const x = cl(p.x), y = cl(p.y), w = cl(p.w), h = cl(p.h)
    const box: DetectBox | null = x !== null && y !== null && w !== null && h !== null && w > 0 && h > 0 ? { x, y, w, h } : null
    if (!found || clarity === 'none' || !box) return none
    return { found, box, frontal, clarity, faceCount }
  } catch {
    return none
  }
}

/** Puntúa una candidata. 0 = descartar. GATE ESTRICTO: solo UNA cara, CLARA y de
 *  FRENTE. Los screenshots de perfil (cara diminuta/de lejos/de lado, o con
 *  caras de "sugeridos"/seguidores) NO pasan → el endpoint devuelve 422 honesto
 *  en vez de fabricar un avatar sin cara o de otra persona. Entre las aceptadas,
 *  gana la de cara más grande (más reconocible). */
export function scoreFaceCandidate(a: FaceAssessment): number {
  if (!a.found || !a.box) return 0
  if (a.clarity !== 'clear') return 0   // borrosa/chica/lejana → no
  if (!a.frontal) return 0              // de perfil/de espaldas → no
  if (a.faceCount !== 1) return 0       // 0 o varias caras (grupo/sugeridos) → no
  const area = a.box.w * a.box.h
  if (area < MIN_FACE_AREA) return 0    // cara diminuta (screenshot escénico) → no
  return 100 + Math.round(Math.min(1, area * 4) * 30) // 100..130, ranking por tamaño
}
