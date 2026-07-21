// SIR V2 — "¿Quién es quién?" por Telegram (PURO, testeable).
//
// El reader capta handles de IG que Aaron sigue pero no están asignados a un
// contacto (unmatched_social_activity). En vez de dejarlos como ruido, SIR le
// PREGUNTA por Telegram quién es cada uno; Aaron responde "@handle Nombre" para
// los que son su gente (o "@handle no" para descartar). Acá va el armado de la
// pregunta y el parseo de la respuesta; el matcheo nombre→persona lo hace la ruta
// (reusa social-reader/match).

import { canonHandle } from './match'

export interface WhoIsWhoAssignment {
  handle: string
  /** Nombre que dio Aaron, o null = "no es un contacto" (descartar). */
  name: string | null
}

// Palabras que significan "no es un contacto" (descartar el handle).
const DISMISS = /^(no|nel|nop|nadie|ningun[oa]?|x+|-+|—+|descartar|paso|skip|ignora(r|lo)?)$/i

/**
 * Parsea la respuesta de Aaron. Por cada "@handle" en el texto toma lo que sigue
 * (hasta el próximo "@" o salto de línea) como el nombre; si es una palabra de
 * descarte o está vacío → name null (descartar). Dedup por handle. PURO.
 */
export function parseWhoIsWhoReply(text: string): WhoIsWhoAssignment[] {
  const out: WhoIsWhoAssignment[] = []
  const seen = new Set<string>()
  const re = /@([a-zA-Z0-9._]+)\s*(?:=|:)?\s*([^@\n]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const handle = canonHandle(m[1])
    if (!handle || seen.has(handle)) continue
    seen.add(handle)
    const rest = (m[2] || '').trim().replace(/^[-—=:\s]+/, '').trim()
    const name = !rest || DISMISS.test(rest) ? null : rest.slice(0, 120)
    out.push({ handle, name })
  }
  return out
}

/** Los handles que Aaron mencionó (para chequear contra los pendientes). PURO. */
export function handlesInReply(text: string): string[] {
  return parseWhoIsWhoReply(text).map((a) => a.handle)
}

/** Mensaje que SIR manda por Telegram preguntando quién es quién. PURO. */
export function buildWhoIsWhoQuestion(handles: string[]): string {
  const list = handles.slice(0, 8).map((h) => `· @${h}`).join('\n')
  return [
    '👀 Vi historias de estas cuentas que sigues en Instagram, pero no sé quiénes son:',
    '',
    list,
    '',
    'Si alguna es de tu red, respóndeme con el nombre (una por línea):',
    '@handle Nombre Apellido',
    '',
    'Las que no menciones las dejo pasar. Si alguna NO es un contacto, pon "@handle no".',
  ].join('\n')
}
