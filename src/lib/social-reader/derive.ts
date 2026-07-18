// SIR V2 — Deriva una señal de TIMING desde una captura social pasiva (Parte A).
// PURO, testeable. Convierte lo que la extensión ya vio (texto de una story, un
// headline de LinkedIn) en una señal de contact_activity que alimenta el motor
// de timing (Parte B). Honesto: si no hay nada claro, devuelve null (no inventa).

import type { ContactSignalKind } from '@/lib/contact-timing/types'

// Pistas de "está de viaje/fuera" en el texto de una story/post (es/en + emojis).
const TRAVEL_RE =
  /(\bviaj|escapad|de viaje|\btrip\b|\btravel|airport|aeropuerto|\bvuelo\b|\bflight\b|vacacion|vacation|holiday|\bplaya\b|\bbeach\b|road ?trip|carretera|crucero|\bcruise\b|✈|🏖|🌴|🧳)/i

export interface SocialCaptureInput {
  platform: 'instagram' | 'linkedin' | string
  /** Texto visible de la story/post (caption + overlays), si lo hay. */
  text?: string | null
  /** IG: ¿tiene story activa ahora mismo? */
  hasActiveStory?: boolean
  /** LinkedIn: headline actual capturado al ver su perfil. */
  headline?: string | null
  /** LinkedIn: headline previo conocido (lo pone el server desde people). */
  priorHeadline?: string | null
}

export interface DerivedSignal {
  kind: ContactSignalKind
  detail: string | null
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function snippet(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ')
  return t.length > 90 ? t.slice(0, 89) + '…' : t
}

/**
 * Deriva la señal de timing de una captura social pasiva, o null si no hay nada
 * accionable. PURO.
 *  - LinkedIn: solo dispara si el headline CAMBIÓ (job_change); ver un perfil con
 *    el mismo headline no es señal.
 *  - Instagram/otro: texto con pistas de viaje → traveling; si no, una story/post
 *    reciente → available ("por acá/activa"). Sin texto ni story → null.
 */
export function deriveSocialSignal(i: SocialCaptureInput): DerivedSignal | null {
  const text = (i.text ?? '').trim()

  if (i.platform === 'linkedin') {
    const h = (i.headline ?? '').trim()
    const prev = (i.priorHeadline ?? '').trim()
    if (h && prev && norm(h) !== norm(prev)) return { kind: 'job_change', detail: h.slice(0, 120) }
    return null
  }

  // instagram (o cualquier plataforma con texto de story/post)
  if (text && TRAVEL_RE.test(text)) return { kind: 'traveling', detail: snippet(text) }
  if (i.hasActiveStory || text) return { kind: 'available', detail: text ? snippet(text) : null }
  return null
}
