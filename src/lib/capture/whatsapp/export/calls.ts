// SIR V2 — Extracción de LLAMADAS del export de WhatsApp. PURO.
// El export deja un registro de cada llamada (voz/video, perdida, a veces
// duración) como una línea con su timestamp. El parser de mensajes las trata
// como sistema y las descarta; acá las recuperamos para registrar "cuándo y a
// qué hora hubo una llamada" (entra al día-X como interacción).
import { clean, matchPrefix, splitAuthor, toISO, toHHmm } from './parse'

export interface ParsedCall {
  iso: string | null        // timestamp del evento (UTC ISO)
  time: string              // HH:mm local (del export)
  type: 'voice' | 'video'
  missed: boolean           // perdida / sin respuesta / silenciada
  duration: string | null   // texto de duración si aparece (ej. "5 min")
}

// El CONTENIDO de la línea (tras el autor) debe SER la notificación de llamada
// — anclado al inicio para no confundir "te hago una llamada luego".
const CALL_START = /^‎?\s*(?:(?:missed|silenced)\s+)?(?:video\s*call|voice\s+call|videollamada|llamada(?:\s+de\s+v(?:í|i)deo|\s+de\s+voz)?)/i
const VIDEO_RE = /v(?:í|i)deo|video/i
const MISSED_RE = /perdida|sin\s+respuesta|no\s+contest|silenci|missed|silenced|no\s+answer/i
const DUR_RE = /(\d+\s*(?:h|hr|hora|horas|min|mins?|minutos?|seg|segs?|segundos?|s)\b)/i

/** Extrae las llamadas del texto del export. Opcional `sinceISO`: solo las
 *  POSTERIORES (estricto) — para no re-registrar al re-subir el chat. */
export function extractCalls(text: string, sinceISO: string | null = null): ParsedCall[] {
  const out: ParsedCall[] = []
  const lines = (text ?? '').split(/\r?\n/)
  for (const raw of lines) {
    const pref = matchPrefix(clean(raw))
    if (!pref) continue
    const split = splitAuthor(pref.rest)
    if (!split) continue
    const content = split.content
    if (!CALL_START.test(content)) continue
    const iso = toISO(pref.date, pref.time, pref.ampm)
    if (sinceISO && !(iso && iso > sinceISO)) continue
    const durM = content.match(DUR_RE)
    out.push({
      iso,
      time: toHHmm(pref.time, pref.ampm),
      type: VIDEO_RE.test(content) ? 'video' : 'voice',
      missed: MISSED_RE.test(content),
      duration: durM ? durM[1].replace(/\s+/g, ' ').trim() : null,
    })
  }
  return out
}

/** Etiqueta legible de una llamada para la nota del person_log / bitácora. */
export function callLabel(c: ParsedCall): string {
  const tipo = c.type === 'video' ? 'Videollamada' : 'Llamada de voz'
  if (c.missed) return `📞 ${tipo} perdida`
  return `📞 ${tipo}${c.duration ? ` · ${c.duration}` : ''}`
}
