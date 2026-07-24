// SIR V2 — Estado del READER SOCIAL para el chat (askSir).
//
// PROBLEMA que arregla: el chat de SIR era CIEGO al reader social. Aaron preguntó
// "¿desde cuándo no recibes info de Instagram?" y SIR respondió "nunca se integró,
// no tengo nada" — FALSO: el reader (extensión de navegador, pasivo) SÍ existe,
// alimenta contact_activity (señales de timing) y unmatched_social_activity
// (cuentas por identificar). Este módulo detecta cuándo la pregunta toca el
// reader/Instagram/historias/redes y RENDERIZA un bloque de estado real (conteos
// + última señal) para el grounding, así SIR nunca niega algo que sí construimos.
//
// Todo PURO: recibe primitivos (conteos + fecha ISO), no toca la red. Las 2
// queries baratas (conteo + max fecha por tabla) viven en askSir. Ver
// docs/READER_ARCHITECTURE.md y src/app/api/social/ingest.

import { agoLabel, daysBetween } from '@/lib/sir/recall'

/** Estado computado del reader (los 2 conteos + la señal más reciente). */
export interface ReaderStatusInput {
  /** Filas en unmatched_social_activity: cuentas de IG vistas SIN identificar. */
  unmatchedCount: number
  /** Filas en contact_activity: contactos con actividad/timing registrada. */
  contactActivityCount: number
  /** Fecha ISO de la señal más reciente entre ambas tablas, o null si no hay. */
  lastSignalISO: string | null
}

// Palabras que disparan el bloque de estado del reader. Normalizadas (sin tildes,
// minúsculas). "ig" e "insta" van con \b para no matchear dentro de otra palabra.
const READER_KW = [
  'instagram', 'historia', 'story', 'stories', 'reader', 'lector',
  'red social', 'redes sociales', 'redes', 'linkedin', 'social',
]
const READER_KW_WORD = ['ig', 'insta']

/** ¿La pregunta toca el reader social (Instagram/LinkedIn/historias/redes)? */
export function isReaderQuery(question: string): boolean {
  const q = (question || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (READER_KW.some((k) => q.includes(k))) return true
  return READER_KW_WORD.some((k) => new RegExp(`\\b${k}\\b`).test(q))
}

/**
 * Bloque de estado del reader para el prompt. Determinístico. NUNCA vacío cuando
 * se invoca: si no hay señales, lo dice con honestidad ("integrado, sin señales
 * aún"). El objetivo es que SIR jamás niegue que el reader/Instagram existe.
 */
export function renderReaderStatusBlock(input: ReaderStatusInput, nowISO: string): string {
  const lines: string[] = []
  lines.push('== READER SOCIAL (Instagram/LinkedIn) — INTEGRADO Y ACTIVO ==')
  lines.push(
    'SIR tiene un reader: una extensión de navegador que, de forma PASIVA, lee las HISTORIAS de Instagram y perfiles de LinkedIn del círculo de Aaron (lo que él ya ve al navegar logueado). Capta HISTORIAS/actividad y cambios de perfil, NO mensajes directos (DMs). Alimenta dos tablas: contact_activity (señales de timing de contactos ya identificados) y unmatched_social_activity (cuentas vistas que aún no están asignadas a una persona).',
  )

  const hasData = input.unmatchedCount > 0 || input.contactActivityCount > 0 || !!input.lastSignalISO
  if (!hasData) {
    lines.push(
      'ESTADO ACTUAL: el reader está integrado pero AÚN NO ha mandado señales (0 cuentas vistas, 0 actividad registrada). Díselo con honestidad: está listo pero todavía no ha capturado nada. NO digas que "nunca se integró".',
    )
    return lines.join('\n')
  }

  if (input.lastSignalISO) {
    const d = daysBetween(input.lastSignalISO, nowISO)
    const date = input.lastSignalISO.slice(0, 10)
    lines.push(`Última señal del reader: ${date} (${agoLabel(d)}).`)
  } else {
    lines.push('Última señal del reader: sin fecha registrada.')
  }
  lines.push(
    `${input.unmatchedCount} cuenta(s) de Instagram vistas por el reader que AÚN NO están identificadas (bandeja "quién es quién", por asignar a una persona).`,
  )
  lines.push(
    `${input.contactActivityCount} señal(es) de actividad de contactos ya identificados registrada(s) (contact_activity, alimenta el veredicto de "buen/mal momento para contactar").`,
  )
  lines.push(
    'Usa ESTAS cifras y fecha si te preguntan por el reader / Instagram / historias / redes. NUNCA digas que Instagram "nunca se integró" ni que "no tienes nada de nadie": el reader SÍ está integrado y activo.',
  )
  return lines.join('\n')
}
