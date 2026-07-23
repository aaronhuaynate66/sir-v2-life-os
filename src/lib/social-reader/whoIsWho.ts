// SIR V2 — "¿Quién es quién?" por Telegram (PURO, testeable).
//
// El reader capta handles de IG que Aaron sigue pero no están asignados a un
// contacto (unmatched_social_activity). En vez de dejarlos como ruido, SIR le
// PREGUNTA por Telegram quién es cada uno; Aaron responde "@handle Nombre" para
// los que son su gente (o "@handle no" para descartar). Acá va el armado de la
// pregunta y el parseo de la respuesta; el matcheo nombre→persona lo hace la ruta
// (reusa social-reader/match).

import { canonHandle } from './match'
import { looksLikeBusiness } from './looksLikeBusiness'

export interface WhoIsWhoAssignment {
  handle: string
  /** Nombre a usar (matchear o CREAR), o null = "no es un contacto" (descartar). */
  name: string | null
}

// "no es un contacto" (descartar el handle).
const DISMISS = /^(no|nel|nop|nadie|ningun[oa]?|x+|-+|—+|descartar|paso|skip|ignora(r|lo)?)$/i
// "acepta mi pálpito de nombre" (usar el nombre predicho del handle).
const ACCEPT = /^(ok|oka|okey|okok|si|sí|sip|sipi|dale|listo|correcto|es|esa|ese|👍|✅)$/i

/**
 * Predice un nombre probable desde el handle: quita @ y dígitos, separa por
 * `_ . -` y capitaliza. "samuel_effendi_rodriguez" → "Samuel Effendi Rodriguez";
 * "raquel.2flores" → "Raquel Flores". Los concatenados sin separador quedan como
 * un solo token capitalizado (Aaron lo corrige si hace falta). PURO.
 */
export function handleToProbableName(handle: string): string {
  const h = canonHandle(handle)
  const tokens = h
    .replace(/\d+/g, ' ')
    .split(/[._\-]+/)
    .flatMap((t) => t.split(/\s+/))
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.length === 0) return ''
  return tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' ')
}

/**
 * Parsea la respuesta de Aaron. Por cada "@handle": "no/x" → descartar (null);
 * vacío o "ok/sí/dale" → ACEPTA el pálpito (nombre predicho del handle); un
 * texto → ese nombre. Dedup por handle. PURO.
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
    let name: string | null
    if (DISMISS.test(rest)) name = null
    else if (!rest || ACCEPT.test(rest)) name = handleToProbableName(handle) || null
    else name = rest.slice(0, 120)
    out.push({ handle, name })
  }
  return out
}

/** Los handles que Aaron mencionó (para chequear contra los pendientes). PURO. */
export function handlesInReply(text: string): string[] {
  return parseWhoIsWhoReply(text).map((a) => a.handle)
}

/** Mensaje que SIR manda por Telegram preguntando quién es quién. Trae el PÁLPITO
 *  de nombre por handle (predictivo) para que Aaron confirme de un toque. PURO. */
export function buildWhoIsWhoQuestion(handles: string[]): string {
  const list = handles.slice(0, 8).map((h) => {
    if (looksLikeBusiness({ handle: h, name: null })) return `· @${h} → (¿negocio? pon "@${h} no" si no es persona)`
    const guess = handleToProbableName(h)
    return guess ? `· @${h} → ¿${guess}?` : `· @${h}`
  }).join('\n')
  return [
    '👀 Vi historias de estas cuentas que sigues en Instagram. Te tiro mi mejor pálpito del nombre — confírmalo o corrígelo (una por línea):',
    '',
    list,
    '',
    '• "@handle ok" → lo creo/enlazo con ese nombre',
    '• "@handle Nombre Apellido" → si mi pálpito está mal',
    '• "@handle no" → no es un contacto',
  ].join('\n')
}
